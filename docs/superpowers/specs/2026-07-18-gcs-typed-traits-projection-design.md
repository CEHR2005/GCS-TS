# GCS Typed Traits Projection Design

**Date:** 2026-07-18

**Status:** Approved for written-spec review

**Upstream baseline:** GCS v5.44.0, GCS Master Library v5.12.0,
Toolbox v2.15.0

## Goal

Add the smallest trustworthy typed traits and trait-modifiers slice to
`@gcs/gcs-engine`: a runtime-validated, recursively immutable projection over
an already parsed `GcsDocumentV5`.

The projection exposes canonical v5 source fields through TypeScript types,
validates persisted structure against pinned GCS, and never mutates or replaces
the generic document. It does not provide editing, write-back, calculations,
recalculation, UI, persistence, or older data-version support.

## Prerequisite repairs from PR #2 review

The feature branch begins at PR #2 head and must first repair its verified
conformance gaps:

- `parseFxp` accepts the underscore placement supported by pinned GCS exponent
  parsing, including `1e1_0` and `1_0e1`;
- syntactically valid exponent overflow such as `1e309` raises
  `FXP_OUT_OF_RANGE`, not `INVALID_FXP`;
- enum table oracle results are built from pinned upstream `Types`, `Options`,
  `Rolls`, `Adjustments`, and `Levels` slices instead of handwritten ordering;
- fixed-point documentation explicitly distinguishes GCS-compatible
  sign/dot/comma-only zero forms from malformed input.

Each repair requires a failing regression or differential test before its
implementation.

## Architectural boundary

Production remains TypeScript-only and runtime-dependency-free. New production
code lives in `packages/gcs-engine/src/traits/`:

- `types.ts` owns the readonly public model;
- `errors.ts` owns stable projection error codes and JSON-pointer paths;
- `readonly-json.ts` validates, clones, and recursively freezes opaque JSON;
- `fields.ts` owns shared scalar, enum, TID, fixed-point, and collection
  readers;
- `project.ts` validates the trait/modifier tree and builds the projection;
- `index.ts` exposes the module surface to the package root.

The generic `parseGcsV5` and `serializeGcsV5` APIs remain unchanged. Consumers
must keep the original `GcsDocumentV5` as the serialization source. A projected
tree is a read model, not a replacement document and not a write-back payload.

## Public API

The package exports this direction and naming:

```ts
export const GCS_TRAIT_PROJECTION_MAX_DEPTH = 256 as const;

export type GcsTraitProjectionErrorCode =
  | "INVALID_TRAITS"
  | "INVALID_TRAIT"
  | "INVALID_TRAIT_MODIFIER"
  | "INVALID_FIELD"
  | "INVALID_NODE_KIND"
  | "INVALID_CONTAINER_SHAPE"
  | "UNSAFE_FXP_NUMBER"
  | "CYCLE_DETECTED"
  | "MAX_DEPTH_EXCEEDED";

export class GcsTraitProjectionError extends Error {
  readonly code: GcsTraitProjectionErrorCode;
  readonly path: string;

  constructor(code: GcsTraitProjectionErrorCode, message: string, path: string);
}

export function projectGcsTraitsV5(
  document: GcsDocumentV5,
): readonly GcsTraitNodeV5[] | undefined;
```

`undefined` means the document has no `traits` property. A present empty array
returns a frozen empty array. The same absent-versus-empty rule applies to
`children` and `modifiers`.

The public model uses camel-case TypeScript property names and four
discriminants derived from TID kind:

```ts
export type GcsReadonlyJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly GcsReadonlyJsonValue[]
  | GcsReadonlyJsonObject;

export type GcsReadonlyJsonObject = {
  readonly [key: string]: GcsReadonlyJsonValue;
};

export type GcsSourceV5 = {
  readonly library: string;
  readonly path: string;
  readonly id: Tid;
};

export type GcsStudyV5 = {
  readonly type: StudyType;
  readonly hours: Fxp;
  readonly note?: string;
};

type GcsTraitCommonV5 = {
  readonly id: Tid;
  readonly source?: GcsSourceV5;
  readonly name?: string;
  readonly reference?: string;
  readonly referenceHighlight?: string;
  readonly localNotes?: string;
  readonly tags?: readonly string[];
  readonly prerequisites?: GcsReadonlyJsonObject;
  readonly selfControlRoll?: SelfControlRoll;
  readonly selfControlAdjustment?: SelfControlAdjustment;
  readonly frequency?: FrequencyRoll;
  readonly disabled?: boolean;
  readonly vttNotes?: string;
  readonly userDescription?: string;
  readonly replacements?: Readonly<Record<string, string>>;
  readonly modifiers?: readonly GcsTraitModifierNodeV5[];
  readonly thirdParty?: GcsReadonlyJsonObject;
  readonly calc?: GcsReadonlyJsonObject;
};

export type GcsTraitNodeV5 = GcsTraitV5 | GcsTraitContainerV5;
export type GcsTraitModifierNodeV5 =
  GcsTraitModifierV5 | GcsTraitModifierContainerV5;

export type GcsTraitV5 = GcsTraitCommonV5 & {
  readonly kind: "trait";
  readonly basePoints?: Fxp;
  readonly pointsPerLevel?: Fxp;
  readonly levels?: Fxp;
  readonly roundDown?: boolean;
  readonly canLevel?: boolean;
  readonly study?: readonly GcsStudyV5[];
  readonly studyHoursNeeded?: StudyLevel;
  readonly features?: readonly GcsReadonlyJsonValue[];
  readonly weapons?: readonly GcsReadonlyJsonValue[];
};

export type GcsTraitContainerV5 = GcsTraitCommonV5 & {
  readonly kind: "trait_container";
  readonly ancestry?: string;
  readonly templatePicker?: GcsReadonlyJsonObject;
  readonly containerType?: TraitContainerType;
  readonly children?: readonly GcsTraitNodeV5[];
};

type GcsTraitModifierCommonV5 = {
  readonly id: Tid;
  readonly source?: GcsSourceV5;
  readonly name?: string;
  readonly reference?: string;
  readonly referenceHighlight?: string;
  readonly localNotes?: string;
  readonly tags?: readonly string[];
  readonly vttNotes?: string;
  readonly replacements?: Readonly<Record<string, string>>;
  readonly thirdParty?: GcsReadonlyJsonObject;
  readonly calc?: GcsReadonlyJsonObject;
};

export type GcsTraitModifierV5 = GcsTraitModifierCommonV5 & {
  readonly kind: "trait_modifier";
  readonly costAdjustment?: string;
  readonly useLevelFromTrait?: boolean;
  readonly showNotesOnWeapon?: boolean;
  readonly affects?: TraitModifierAffects;
  readonly features?: readonly GcsReadonlyJsonValue[];
  readonly levels?: Fxp;
  readonly disabled?: boolean;
};

export type GcsTraitModifierContainerV5 = GcsTraitModifierCommonV5 & {
  readonly kind: "trait_modifier_container";
  readonly children?: readonly GcsTraitModifierNodeV5[];
};
```

All wire-optional fields remain optional. The projection does not insert GCS
zero defaults and does not erase the distinction between an omitted field and
an explicitly persisted zero value.

## Typed fields

Trait common fields include `source`, `name`, `reference`,
`referenceHighlight`, `localNotes`, `tags`, `prerequisites`,
`selfControlRoll`, `selfControlAdjustment`, `frequency`, `disabled`,
`vttNotes`, `userDescription`, `replacements`, `modifiers`, `thirdParty`, and
`calc`.

Trait leaf-only fields include `basePoints`, `pointsPerLevel`, `levels`,
`roundDown`, `canLevel`, `study`, `studyHoursNeeded`, `features`, and `weapons`.

Trait container-only fields include `ancestry`, `templatePicker`,
`containerType`, and `children`.

Modifier common fields include `source`, `name`, `reference`,
`referenceHighlight`, `localNotes`, `tags`, `vttNotes`, `replacements`,
`thirdParty`, and `calc`.

Modifier leaf-only fields include `costAdjustment`, `useLevelFromTrait`,
`showNotesOnWeapon`, `affects`, `features`, `levels`, and `disabled`. Modifier
containers add only `children`.

`GcsSourceV5` requires `library`, `path`, and a source `Tid` whenever `source`
is present. Its TID kind must match the enclosing trait or modifier node kind.
`GcsStudyV5` requires canonical `StudyType` and safe `Fxp` hours and accepts an
optional note.

Existing primitives are reused directly:

- all IDs use `Tid` with exact kind checks;
- fixed-point fields use `Fxp`;
- container type, modifier affects, self-control, frequency, and study fields
  use the existing strict enum types;
- compatibility normalizers are not used by strict projection.

`cost_adj` stays an uninterpreted string. Its percentage/multiplier/points DSL
belongs to calculation parity.

## Opaque and unknown data

`features`, `prereqs`, `weapons`, `template_picker`, `calc`, and
`third_party` are validated as JSON, cloned, and recursively frozen through an
exported `GcsReadonlyJsonValue` type. Direct fields around them remain typed.

Unknown node fields are not copied into the projected type. They remain in the
untouched original `GcsDocumentV5`, so generic serialization continues to
preserve them. Documentation must warn that reconstructing a document from the
projection would drop unknown fields and is unsupported.

The clone never aliases mutable arrays or objects from the input document.
Every projected node, collection, source, study record, replacement map, and
opaque JSON value is frozen at runtime as well as readonly at compile time.

## Fixed-point JSON-number policy

GCS writes `fxp.Int` as unquoted JSON numbers. Native `JSON.parse` converts the
token to a JavaScript `number`, so the original decimal lexeme is unavailable
to `projectGcsTraitsV5`.

This slice uses the approved conservative policy:

1. The value must be a finite JavaScript number.
2. Its canonical JavaScript decimal text must parse through `parseFxp`.
3. The resulting raw fixed-point integer must be within JavaScript's safe
   integer range, inclusive.
4. `Number(formatFxp(result))` must equal the input number.

This yields an exact projection range of raw
`-9007199254740991..9007199254740991`, or real
`-900719925474.0991..900719925474.0991`. It rejects extra precision,
unrecoverable magnitudes, non-finite values, and fixed-point overflow with
`UNSAFE_FXP_NUMBER` at the exact field path.

A future raw-source typed parser may extend the range by retaining JSON number
lexemes. It is explicitly outside this slice and must not be simulated with
unsafe casts or floating-point rounding.

## Validation and errors

Projection is strict and performs no migration or repair:

- `traits`, `children`, `modifiers`, `tags`, and `study` must be arrays when
  present;
- every node must be a non-null object with a valid TID of an allowed exact
  kind;
- field values must match their documented JSON shape;
- enums must already be canonical persisted values;
- a trait leaf may not contain `children` or container-only fields;
- a trait container may not contain leaf-only fields;
- a modifier leaf may not contain `children`;
- a modifier container may not contain modifier leaf-only fields;
- source objects must contain all three required fields;
- object-identity cycles are rejected;
- nested trait, modifier, or opaque JSON depth beyond 256 is rejected.

All failures are `GcsTraitProjectionError` with a stable code and RFC 6901-style
path such as `/traits/2/modifiers/0/affects`. Primitive and enum errors are
wrapped so callers see one domain error surface and the failing document path.

The error mapping is fixed:

- a non-array root `traits` value uses `INVALID_TRAITS`;
- a non-object trait or modifier entry uses `INVALID_TRAIT` or
  `INVALID_TRAIT_MODIFIER` respectively;
- missing fields, nulls, wrong scalar types, invalid TID syntax, non-JSON opaque
  values, and strict enum failures use `INVALID_FIELD`;
- a valid TID with the wrong or unsupported kind uses `INVALID_NODE_KIND`;
- fields forbidden by the leaf/container discriminant use
  `INVALID_CONTAINER_SHAPE`;
- fixed-point conversion failures use `UNSAFE_FXP_NUMBER`;
- active-ancestor object reuse uses `CYCLE_DETECTED`;
- attempted nesting at depth 257 uses `MAX_DEPTH_EXCEEDED`.

Root trait nodes have depth 1. Each nested trait, modifier, opaque object, or
opaque array increments depth by one. Reusing an object in separate non-nested
branches is not a cycle; each occurrence is projected to an independent frozen
clone.

GCS behaviors that regenerate invalid IDs, sort tags, clear inapplicable
fields, force `can_level`, clamp negative levels, or otherwise migrate data are
not reproduced. A future compatibility adapter may expose such repairs only
with visible diagnostics.

## Test-only traits oracle

Create `tools/gcs-traits-oracle`, pinned to GCS v5.44.0 and Toolbox v2.15.0.
It is a JSONL CLI used only by tests and CI; production remains TypeScript-only.

The protocol operation `traits.project` receives an ID and an original document
string. It loads canonical v5 data through pinned GCS and returns a recursive
source-field projection. Fixed-point values travel as raw decimal strings.
Internal failures, malformed envelopes, unknown operations, and impossible
response encoding terminate the process non-zero.

Conformance compares the TypeScript projection transformed to the same test
shape against the Go result after recursive key sorting. The oracle comparison
covers known scalar fields, IDs, kinds, sources, study records, enums, and tree
boundaries. Opaque JSON retention remains covered by TypeScript unit tests and
the existing whole-document oracle.

No canonical test depends on `~/app/dragon-reaper/GCS`, `/GCS`, or another
host-specific path. Pinned Go modules and committed fixtures are sufficient.

## Testing strategy

Implementation follows strict RED-GREEN-REFACTOR cycles. Required coverage:

- compile-time discrimination of all four node variants and leaf/container
  field separation;
- missing, empty, and populated `traits`, `children`, and `modifiers`;
- all direct trait and modifier scalar fields;
- safe fixed-point values and every unsafe-number failure class;
- source and study records;
- canonical enums and invalid values;
- wrong TID kinds and invalid IDs with exact paths;
- forbidden leaf/container field combinations;
- recursive trait and modifier containers, cycle detection, and depth limit;
- deep runtime immutability and absence of aliases to the input document;
- opaque JSON cloning and validation;
- successful projection of all three committed fixtures;
- synthetic vectors for legitimate fields absent from those fixtures;
- pinned Go source-projection conformance;
- built-package export smoke tests;
- unchanged generic parse/serialize and primitive conformance.

The root `pnpm check` includes the new Go tests and TypeScript-to-Go traits
conformance. The canonical gate remains:

```sh
docker compose run --rm toolchain pnpm check
```

## Licensing and documentation

Translated GCS model behavior remains within the MPL-2.0
`packages/gcs-engine` boundary. The test-only Go oracle imports pinned upstream
modules and is documented in `THIRD_PARTY_NOTICES.md`. The rest of the monorepo
does not acquire MPL-2.0 solely because of this slice.

Root and package READMEs document the readonly projection, strict-versus-
compatibility boundary, safe-number range, runtime immutability, original-
document retention requirement, oracle role, and next slice.

The nested `packages/gcs-engine/AGENTS.md` should receive the fixed-point
compatibility rule proposed during PR #2 review after user approval.

## Out of scope

- Trait or modifier mutation, creation, deletion, duplication, toggle state,
  movement, or write-back.
- Cost parsing, point calculation, derived `calc`, or `Recalculate` parity.
- Typed features, prerequisites, weapons, or template-picker criteria.
- Search, folders, drag-and-drop, context menus, Next.js, shadcn/ui, Prisma,
  PostgreSQL, authentication, or deployment.
- GCS data versions other than v5.
- A production dependency on Go or any oracle executable.
- Requiring or committing a complete external GCS corpus.

## Acceptance criteria

- PR #2 review gaps are covered by failing tests and repaired.
- `projectGcsTraitsV5` returns a deeply frozen, non-aliasing typed projection
  while leaving `GcsDocumentV5` unchanged.
- All four node variants, direct source fields, existing primitives, structural
  collections, and strict invariants are represented and tested.
- Unsafe JSON-number conversion cannot silently alter fixed-point state.
- Unknown fields and `third_party` remain available through the unchanged
  original document and survive generic serialization.
- All committed fixtures and synthetic coverage pass TypeScript validation.
- Known projected source behavior matches the pinned Go traits oracle.
- The published package has no runtime dependencies and no Go requirement.
- The complete canonical Docker gate passes.
- The final branch receives task-level and whole-branch Superpowers review.
