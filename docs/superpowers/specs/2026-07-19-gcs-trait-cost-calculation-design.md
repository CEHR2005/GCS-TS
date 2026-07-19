# GCS Trait Cost Calculation Design

**Date:** 2026-07-19

**Status:** Approved

**Upstream baseline:** GCS v5.44.0, GCS Master Library v5.12.0,
Toolbox v2.15.0

## Goal

Add a pure, runtime-dependency-free TypeScript calculation kernel that consumes
the existing readonly `GcsTraitNodeV5` projection and returns immutable current
levels and adjusted point totals conforming to pinned GCS trait-cost behavior.

This slice calculates persisted trait state with nil-entity semantics. It does
not process features, resolve entity bonuses, mutate source data, write derived
`calc` fields, or implement full `Entity.Recalculate`.

## Approved decisions

- Calculation is a separate module over `projectGcsTraitsV5`, not part of
  projection and not a raw-document traversal.
- The public result exposes only normative final values, not a calculation
  breakdown or diagnostic trace.
- `useMultiplicativeModifiers` is an explicit required option; the kernel does
  not read sheet settings from `GcsDocumentV5`.
- Entity-derived trait level bonuses are zero. Persisted `levels` are the only
  level input.
- GCS compatibility includes permissive `cost_adj` fallback behavior.
- Production remains TypeScript-only with no runtime dependencies.

## Architectural boundary

New production code lives in `packages/gcs-engine/src/traits/calculation/`:

- `types.ts` owns public options and readonly result types;
- `errors.ts` owns stable boundary-error codes and JSON-pointer paths;
- `fraction.ts` owns internal fixed-point fraction arithmetic;
- `cost-adjustment.ts` classifies and extracts GCS `cost_adj` values;
- `calculate.ts` performs recursive trait and container calculation;
- `index.ts` controls the calculation export surface.

The existing `traits/fields.ts` and `traits/project.ts` are not expanded.
`projectGcsTraitsV5` remains the sole runtime validator for persisted trait
shape, and `serializeGcsV5` continues to accept only the untouched generic
document as its supported serialization source.

The data flow is:

```text
GcsDocumentV5
  -> projectGcsTraitsV5()
  -> calculateGcsTraitPointsV5()
  -> readonly calculation result tree
```

## Public API

The package exports:

```ts
export type GcsTraitCalculationOptionsV5 = {
  readonly useMultiplicativeModifiers: boolean;
};

export type GcsTraitCalculationNodeV5 =
  GcsTraitCalculationV5 | GcsTraitContainerCalculationV5;

export type GcsTraitCalculationV5 = {
  readonly kind: "trait";
  readonly id: Tid;
  readonly currentLevel: Fxp;
  readonly adjustedPoints: Fxp;
};

export type GcsTraitContainerCalculationV5 = {
  readonly kind: "trait_container";
  readonly id: Tid;
  readonly adjustedPoints: Fxp;
  readonly children?: readonly GcsTraitCalculationNodeV5[];
};

export function calculateGcsTraitPointsV5(
  traits: readonly GcsTraitNodeV5[] | undefined,
  options: GcsTraitCalculationOptionsV5,
): readonly GcsTraitCalculationNodeV5[] | undefined;
```

The result preserves input order, discriminants, TIDs, recursive structure,
and absent-versus-empty collection distinctions. It is deeply frozen and has
no mutable aliases to the projection. Trait containers omit `currentLevel`
because pinned GCS containers are not leveled.

`undefined` input returns `undefined`. A present empty root returns a frozen
empty array. Missing container children remain absent; present empty children
produce a frozen empty array.

## Trait state semantics

Absent fixed-point source fields mean zero and absent booleans mean false.

A leaf `currentLevel` is zero when the trait or any ancestor is disabled, when
`canLevel` is false, or when persisted `levels` is negative. Otherwise it is
the persisted level. Entity feature bonuses are never consulted.

An effectively disabled leaf has zero adjusted points. Disabled containers
remain in the result tree, and every descendant is calculated as effectively
disabled, so the complete disabled subtree has zero totals.

When `canLevel` is false, both levels and points-per-level are ignored for
point calculation, matching pinned `AdjustedPoints` behavior. Negative
persisted levels remain an input to the point formula when `canLevel` is true,
even though `currentLevel` is clamped to zero; this intentionally mirrors the
upstream function rather than GCS load-time repair behavior.

## Modifier traversal

A trait leaf receives its own modifiers followed by the modifiers of each
ancestor trait container, from the nearest parent outward. Modifier containers
are traversed recursively but do not contribute a cost adjustment themselves.
Disabled modifier leaves are skipped according to pinned enabled traversal
semantics.

The four adjustment categories are detected from trimmed `cost_adj` text:

- a value without a multiplier marker or percent suffix is an addition;
- a percent suffix is a percentage adder;
- an `x` or Unicode `×` prefix plus percent suffix is a percentage multiplier;
- an `x` or `×` prefix or suffix without percent is a multiplier.

Decimal and `numerator/denominator` forms use pinned fixed-point fraction
semantics. Trailing non-digits are removed as upstream does. Empty, malformed,
sign-only, and zero-denominator forms follow pinned forced-parsing and
normalization fallbacks rather than producing a new strict parse error.

A leveled modifier multiplies its extracted adjustment by the persisted trait
current level when `useLevelFromTrait` is true, or by its own persisted levels
otherwise. This level multiplier has a minimum of one. That minimum does not
apply to an explicit adjustment such as `x2/3`.

## Point formula

Point additions affect base points unless `affects` is `levels_only`, in which
case they affect points-per-level only when the trait can level.

Percentage adders are accumulated separately as enhancements and limitations
for base and leveled points according to `affects`. Total applies to both,
`base_only` applies only to base points, and `levels_only` applies only to
leveled points. Limitations are clamped at negative eighty percent.

In additive mode, enhancement and limitation percentages are combined before
application. In multiplicative mode, enhancement and limitation fractions are
applied sequentially, retaining the same negative-eighty limitation floor.

Percentage multipliers and direct multipliers contribute to the final
multiplier. The initial multiplier is the product of the pinned self-control
and frequency multipliers. Missing self-control and frequency values use their
zero-value multiplier of one.

The final fractional value is converted through pinned fixed-point semantics
and rounded to whole points: floor when `roundDown` is true and ceiling
otherwise. Signed 64-bit wrapping, saturation, division, and fraction
normalization match the already pinned GCS/Toolbox behavior.

## Container aggregation

A regular trait container sums the adjusted points of its children. Its
modifiers affect descendants through inheritance but are not applied again to
the aggregate total.

For an `alternative_abilities` container, maximum selection starts at zero. If
one or more child totals equal the selected maximum, the first such child is
counted fully and every other child contributes twenty percent. If every child
is negative, no child is selected for full cost and every child contributes
twenty percent. Each secondary value is rounded independently with the
upstream container behavior. Valid persisted v5 containers have no `roundDown`
field, so secondary alternative-ability values round upward.

## Error model

The package exports:

```ts
export type GcsTraitCalculationErrorCode =
  "INVALID_OPTIONS" | "CYCLE_DETECTED" | "MAX_DEPTH_EXCEEDED";

export class GcsTraitCalculationError extends Error {
  readonly code: GcsTraitCalculationErrorCode;
  readonly path: string;

  constructor(
    code: GcsTraitCalculationErrorCode,
    message: string,
    path: string,
  );
}
```

A missing or non-boolean `useMultiplicativeModifiers` produces
`INVALID_OPTIONS` at `/options/useMultiplicativeModifiers`. Defensive traversal
rejects active-ancestor reuse with `CYCLE_DETECTED` and nesting beyond 256 with
`MAX_DEPTH_EXCEEDED`. Paths use source-compatible pointers such as
`/traits/2/children/0`. Reuse in separate non-nested branches is permitted and
produces independent frozen results.

Persisted-field validation is not duplicated. Inputs other than a value
returned by `projectGcsTraitsV5` are outside the supported runtime contract,
apart from the explicit option and traversal guards above.

## Test-only oracle

Extend `tools/gcs-traits-oracle`; do not create a fourth Go module. Add a
`traits.calculate` JSONL operation with request fields `id`, `op`, `document`,
and `use_multiplicative_modifiers`.

The oracle decodes with pinned GCS, attaches the trait tree to a fresh entity
that has the selected sheet setting but has not processed features, and uses
upstream trait methods for calculation. Tests must prove that the oracle sees
parent relationships and inherited modifiers while entity-derived level
bonuses remain zero.

Successful responses return only kind, TID, current level, adjusted points,
and recursive children. Fixed-point values travel as raw decimal strings.
Malformed envelopes, unknown operations, response protocol violations, and
internal failures terminate the process non-zero.

## Reproducible toolchain repair

The current final toolchain image does not carry the builder's downloaded Go
module cache, so `pnpm check` downloads pinned modules at runtime. This slice
copies the populated module cache into the final image and verifies all Go test
commands with `GOPROXY=off`.

Docker image construction remains the networked dependency-resolution phase.
After a successful build, the canonical gate must not fetch Go modules. This
repair does not add a production dependency or make the Debian APT layer
bit-for-bit hermetic.

## Testing strategy

Implementation follows observed RED-GREEN-REFACTOR cycles. Required unit and
differential coverage includes:

- internal fraction arithmetic, normalization, zero denominators, and signed
  boundaries;
- every `cost_adj` category, decimal and fractional values, ASCII and Unicode
  multiplier markers, prefix/suffix forms, trailing units, and permissive
  malformed fallbacks;
- absent values, leveled and non-leveled traits, negative levels, all `affects`
  modes, additive and multiplicative settings, the negative-eighty floor,
  self-control, frequency, leveled modifiers, and final rounding;
- own, inherited, nested, and disabled modifiers;
- effectively disabled traits and containers;
- regular and alternative-abilities aggregation, including ties, zeroes,
  negative totals, and per-child rounding;
- absent and empty roots and children, deep freezing, cycle detection, depth
  limits, and independent shared-branch reuse;
- deterministic synthetic differential vectors and all three committed
  fixtures in both modifier modes;
- public TypeScript discrimination and built-package export smoke coverage;
- unchanged document, primitive, and trait-projection conformance;
- offline Go tests and the complete canonical Docker gate.

Add a dedicated `test:traits-calculation-conformance` script and include it in
root `pnpm check`. CI continues to execute the same Docker-first gate.

## Licensing and documentation

Translated calculation behavior remains inside the MPL-2.0
`packages/gcs-engine` boundary. The Go oracle remains test-only and pinned.
Update package and root READMEs, package exports, smoke tests, and third-party
notices when the implementation introduces translated upstream fragments not
already covered by existing notices.

The repository root `AGENTS.md` records the mandatory Superpowers workflow,
canonical environment, and source-availability rules. The nested engine
instructions remain authoritative for GCS domain invariants.

## Out of scope

- Feature processing, entity trait bonuses, and full `Entity.Recalculate`.
- Reading sheet settings from the generic document.
- Public calculation breakdowns or diagnostic traces.
- Writing or replacing `calc` data.
- Trait or modifier creation, mutation, deletion, duplication, toggle state,
  movement, or write-back.
- Skills, spells, equipment, weapons, attributes, or encumbrance calculations.
- Search, folders, drag-and-drop, context menus, Next.js, shadcn/ui, Prisma,
  PostgreSQL, authentication, or deployment.
- GCS data versions other than v5.
- Production Go or new production runtime dependencies.
- A canonical dependency on `/GCS`, `~/app/dragon-reaper/GCS`, or another
  uncommitted host corpus.

## Acceptance criteria

- The exact approved public API is exported from the built package.
- Calculation consumes typed projection data and never mutates or aliases it.
- Result order, identity mapping, tree structure, and absent-versus-empty
  distinctions are retained in a deeply frozen result.
- Leaf, modifier, rounding, disabled, inheritance, and container semantics
  match pinned GCS under nil-entity semantics.
- Both modifier modes and permissive `cost_adj` behavior are differential-
  tested against the pinned oracle.
- Entity-derived trait bonuses are demonstrably absent.
- All committed fixtures and the synthetic matrix pass conformance.
- Existing parse, serialize, primitive, and trait projection behavior remains
  unchanged.
- The production package has zero runtime dependencies and no Go requirement.
- Go unit and conformance tests pass with `GOPROXY=off` after Docker build.
- The canonical Docker gate and GitHub CI pass.
- Task-level specification and quality reviews plus a final whole-branch
  Superpowers review complete with accepted findings resolved through TDD.

## Implementation handoff requirements

The implementation issue must link this specification and its approved TDD
plan, identify the exact baseline commit, and require both root and nested
`AGENTS.md` files to be read before implementation.

It must fail closed unless the official
`superpowers@openai-curated-remote` plugin and `superpowers:using-superpowers`
are available. It must require an isolated worktree,
`superpowers:subagent-driven-development` with a fresh implementer and the
required two-stage review per plan task, TDD with observed RED/GREEN evidence,
systematic debugging, verification before completion, and final code review.

The issue must also state the pinned-source availability rules, exact
deliverables, acceptance criteria, out-of-scope boundaries, stop conditions,
canonical gate, final report requirements, and Deviation Ledger policy.
