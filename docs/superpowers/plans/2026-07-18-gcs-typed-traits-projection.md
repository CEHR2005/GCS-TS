# GCS Typed Traits Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a deeply immutable, strictly validated v5 traits and
trait-modifiers projection to `@gcs/gcs-engine`, with pinned Go conformance and
no write-back or calculation behavior.

**Architecture:** `projectGcsTraitsV5` converts the existing lossless
`GcsDocumentV5` into a new TID-discriminated readonly tree. Focused helpers own
field validation and opaque JSON cloning; the original document remains the
only serialization source. A separate test-only Go oracle projects the same
known source fields from pinned GCS v5.44.0.

**Tech Stack:** TypeScript 6.0.3, Node 24.18.0, pnpm 11.13.1, Vitest 4.1.10,
Go 1.26.5, GCS v5.44.0, Toolbox v2.15.0, Docker Compose.

## Global Constraints

- The approved, binding contract is
  `docs/superpowers/specs/2026-07-18-gcs-typed-traits-projection-design.md`.
  Read its complete Public API, Typed fields, Validation and errors, and
  Test-only traits oracle sections before changing code; this plan supplies
  task order and test cycles without weakening that contract.
- Read `packages/gcs-engine/AGENTS.md` before every task touching that package.
- Use strict RED-GREEN-REFACTOR: every production or bug-fix behavior starts
  with a focused test that is observed failing for the expected reason.
- Production stays TypeScript-only, browser-compatible, and has no runtime
  dependencies.
- Accept only GCS data version 5. Do not change `parseGcsV5` or
  `serializeGcsV5` lossless generic-document behavior.
- Pinned source of truth is GCS v5.44.0, Master Library v5.12.0, and Toolbox
  v2.15.0. Do not use moving branches or host-specific GCS paths.
- `calc` is derived, readonly opaque data. Never edit, generate, or calculate
  it in this slice.
- Unknown fields and `third_party` remain in the unchanged original document.
  Never reconstruct a serializable document from the projection.
- `projectGcsTraitsV5` returns `undefined` for absent `traits`, preserves
  present empty structural arrays, creates no mutable aliases, and recursively
  freezes every returned object and array.
- Root trait depth is 1; attempted depth 257 fails. Active-ancestor cycles fail;
  non-nested shared objects are cloned independently.
- Fixed-point JSON numbers are accepted only when raw value is within
  `-9007199254740991..9007199254740991` and parse/format round-trips to the same
  JavaScript number.
- Strict projection never applies enum compatibility normalization, migrations,
  tag sorting, ID regeneration, field clearing, level clamping, or GCS defaults.
- Only trait/container TID kinds are accepted in the trait tree and only
  modifier/container TID kinds are accepted in modifier trees. Source TID kind
  matches its enclosing node.
- Manually maintained production files target at most 350 lines and must remain
  below 500 lines. Split responsibilities rather than exceeding the soft cap.
- `packages/gcs-engine` and translated GCS behavior remain MPL-2.0; do not
  expand that license to unrelated monorepo files.
- Canonical verification is `docker compose run --rm toolchain pnpm check`.
- Do not edit `AGENTS.md` except for the exact approved candidate in Task 1.

---

### Task 1: Repair PR #2 Conformance Gaps

**Files:**

- Modify: `packages/gcs-engine/test/fxp-codec.test.ts`
- Modify: `packages/gcs-engine/src/fxp/codec.ts`
- Modify: `tests/primitives/fxp-conformance.test.ts`
- Modify: `tools/gcs-primitives-oracle/internal/oracle/enums.go`
- Modify: `tools/gcs-primitives-oracle/internal/oracle/enums_test.go`
- Modify: `packages/gcs-engine/README.md`
- Modify: `docs/superpowers/specs/2026-07-17-gcs-engine-primitives-design.md`
- Modify: `packages/gcs-engine/AGENTS.md`

**Interfaces:**

- Consumes: existing `parseFxp`, primitive oracle `fxp.parse`, and pinned enum
  package exports.
- Produces: GCS-compatible exponent separators, correct overflow error category,
  upstream-derived enum ordering, and the approved durable operating rule.

- [ ] **Step 1: Add failing fixed-point unit tests**

Add these cases to `fxp-codec.test.ts`:

```ts
it.each([
  ["1e1_0", 100_000_000_000_000n],
  ["1_0e1", 1_000_000n],
] as const)("accepts pinned exponent separators in %s", (input, raw) => {
  expect(fxpToRaw(parseFxp(input))).toBe(raw);
});

it.each(["1_e2", "1e_2", "1e2_", "_1e2", "1__0e1"])(
  "rejects invalid exponent separator placement %s",
  (input) =>
    expect(() => parseFxp(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_FXP" }),
    ),
);

it("classifies a finite-syntax exponent overflow", () => {
  expect(() => parseFxp("1e309")).toThrowError(
    expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
  );
});
```

- [ ] **Step 2: Add failing differential vectors**

Extend the exponent conformance test with `1e1_0`, `1_0e1`, and `1e309`.
Compare the first two raw strings and require the last response category and
TypeScript error code to both be `fxp_out_of_range` / `FXP_OUT_OF_RANGE`.

- [ ] **Step 3: Run fixed-point tests to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/fxp-codec.test.ts \
  tests/primitives/fxp-conformance.test.ts
```

Expected: FAIL because underscore-bearing valid inputs throw `INVALID_FXP` and
`1e309` has the wrong TypeScript code.

- [ ] **Step 4: Implement the exact exponent grammar and error mapping**

In `codec.ts`, construct the exponent pattern from decimal digit groups whose
underscores occur only between digits:

```ts
const EXPONENT_DIGITS = String.raw`[0-9](?:_?[0-9])*`;
const EXPONENT_INPUT = new RegExp(
  String.raw`^[+-]?(?:${EXPONENT_DIGITS}(?:\.(?:${EXPONENT_DIGITS})?)?|\.${EXPONENT_DIGITS})[eE][+-]?${EXPONENT_DIGITS}$`,
);
```

Require `EXPONENT_INPUT.test(withoutCommas)`, remove `_` before `Number`, and
throw `GcsPrimitiveError("FXP_OUT_OF_RANGE", ...)` when that number is not
finite. Retain the existing signed-range check and five-decimal compatibility
path.

- [ ] **Step 5: Write a failing upstream-order oracle test**

In `enums_test.go`, temporarily clone and swap the first two
`container.Types`, restore them with `defer`, call `enum.table`, and assert the
returned keys follow the mutated exported slice. The current handwritten table
must fail this test.

```go
func TestEnumTableFollowsPinnedExportedOrdering(t *testing.T) {
	original := container.Types
	mutated := slices.Clone(original)
	mutated[0], mutated[1] = mutated[1], mutated[0]
	container.Types = mutated
	defer func() { container.Types = original }()

	result := enumOperation(t, "enum.table", map[string]any{"domain": "trait_container"})
	want := make([]any, len(mutated))
	for i, value := range mutated {
		want[i] = value.Key()
	}
	if !reflect.DeepEqual(result["values"], want) {
		t.Fatalf("enum.table did not follow container.Types: %#v", result["values"])
	}
}
```

- [ ] **Step 6: Run the enum test to verify RED**

```sh
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle \
  test ./internal/oracle -run EnumTable -v
```

Expected: FAIL because the oracle still starts with the handwritten `group`
constant.

- [ ] **Step 7: Derive every table from pinned exports**

Use these exact slices in `handleEnumTable`:

```go
container.Types
affects.Options
selfctrl.Rolls
selfctrl.Adjustments
frequency.Rolls
study.Levels
study.Types
```

Keep `.Key()` and numeric conversion helpers, but remove all seven handwritten
literal slices.

- [ ] **Step 8: Update the fixed-point contract documentation**

Document that GCS-compatible `+`, `-`, `.`, `+.`, `-.`, and comma-only forms
are accepted as zero even though other malformed forms are rejected. Add this
exact bullet to `packages/gcs-engine/AGENTS.md`:

```md
- Fixed-point textual compatibility is defined by pinned GCS `fxp.FromString`, including its non-obvious sign/dot/comma-only zero forms and Go-valid exponent separators; intentional safer divergences must be explicit and differential-tested.
```

- [ ] **Step 9: Verify GREEN and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/fxp-codec.test.ts \
  tests/primitives/fxp-conformance.test.ts
docker compose run --rm toolchain pnpm test:primitives-oracle
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine tests/primitives \
  tools/gcs-primitives-oracle docs/superpowers/specs/2026-07-17-gcs-engine-primitives-design.md
git commit -m "fix: close primitive conformance gaps"
```

Expected: targeted TypeScript, differential, Go, and type checks pass.

### Task 2: Projection Types, Errors, and Readonly JSON

**Files:**

- Create: `packages/gcs-engine/src/traits/types.ts`
- Create: `packages/gcs-engine/src/traits/errors.ts`
- Create: `packages/gcs-engine/src/traits/readonly-json.ts`
- Create: `packages/gcs-engine/src/traits/index.ts`
- Modify: `packages/gcs-engine/src/index.ts`
- Test: `packages/gcs-engine/test/trait-types.test.ts`
- Test: `packages/gcs-engine/test/readonly-json.test.ts`

**Interfaces:**

- Consumes: `Fxp`, `Tid`, and the seven existing enum types.
- Produces: every public readonly type from the design, projection constants and
  errors, plus internal `cloneReadonlyJson` and `appendJsonPointer` helpers.

- [ ] **Step 1: Write failing public type and error tests**

Use package-root imports and `expectTypeOf` to require all public types and
`GCS_TRAIT_PROJECTION_MAX_DEPTH === 256`. Instantiate
`GcsTraitProjectionError("INVALID_FIELD", "invalid name", "/traits/0/name")`
and assert `name`, `code`, `message`, and required `path`.

Add compile-time assertions that `GcsTraitNodeV5` narrows on `kind`, a trait
leaf has no `children`, a trait container has no `basePoints`, a modifier leaf
has no `children`, and a modifier container has no `costAdjustment`.

- [ ] **Step 2: Write failing readonly JSON tests**

Import the internal helper from `../src/traits/readonly-json.js`. Require it to:

```ts
const input = { nested: [{ value: "original" }], safe: 4 };
const output = cloneReadonlyJson(input, "/calc", 2, new WeakSet());
expect(output).toEqual(input);
expect(output).not.toBe(input);
expect(Object.isFrozen(output)).toBe(true);
expect(Object.isFrozen((output as { nested: readonly unknown[] }).nested)).toBe(
  true,
);
input.nested[0]!.value = "changed";
expect(output).toEqual({ nested: [{ value: "original" }], safe: 4 });
```

Also require JSON-pointer escaping (`a/b~c` becomes `a~1b~0c`), rejection of
`NaN`, `Infinity`, `undefined`, functions, symbols, sparse arrays, symbol-keyed
objects, accessors, non-plain prototypes, cycles, and depth 257.

- [ ] **Step 3: Run tests to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-types.test.ts \
  packages/gcs-engine/test/readonly-json.test.ts
```

Expected: FAIL because the traits module and exports do not exist.

- [ ] **Step 4: Implement the exact public model**

Copy the type signatures from the approved design's `Public API` section
verbatim into `types.ts`; do not rename, add, or omit a property.
Export the common types from that module for internal assembly, but re-export
only these public names from `traits/index.ts` and the package root:

```text
GCS_TRAIT_PROJECTION_MAX_DEPTH
GcsReadonlyJsonValue
GcsReadonlyJsonObject
GcsSourceV5
GcsStudyV5
GcsTraitNodeV5
GcsTraitV5
GcsTraitContainerV5
GcsTraitModifierNodeV5
GcsTraitModifierV5
GcsTraitModifierContainerV5
GcsTraitProjectionErrorCode
GcsTraitProjectionError
```

Implement `GcsTraitProjectionError` with required path and the exact nine-code
union from the design.

- [ ] **Step 5: Implement safe recursive JSON cloning**

`appendJsonPointer(base, token)` replaces `~` with `~0`, `/` with `~1`, and
appends the escaped token. `cloneReadonlyJson` must:

```ts
export function cloneReadonlyJson(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
): GcsReadonlyJsonValue;
```

Return primitives directly, require finite numbers, require depth at most 256
for arrays/objects, reject active ancestors, validate every array index exists,
require `Object.prototype` or null prototype, reject symbol keys and accessor
descriptors, recursively clone with escaped paths, delete the object from
`active` in `finally`, and `Object.freeze` every returned array/object. Build
objects with `Object.create(null)` so `__proto__` remains data.

- [ ] **Step 6: Verify GREEN and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-types.test.ts \
  packages/gcs-engine/test/readonly-json.test.ts
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src packages/gcs-engine/test
git commit -m "feat: add readonly trait projection types"
```

Expected: focused tests and type checking pass.

### Task 3: Strict Field Readers and Trait Tree Projection

**Files:**

- Create: `packages/gcs-engine/src/traits/fields.ts`
- Create: `packages/gcs-engine/src/traits/project.ts`
- Modify: `packages/gcs-engine/src/traits/index.ts`
- Modify: `packages/gcs-engine/src/index.ts`
- Test: `packages/gcs-engine/test/trait-projection-structure.test.ts`
- Test: `packages/gcs-engine/test/trait-projection-errors.test.ts`

**Interfaces:**

- Consumes: Task 2 types/errors/readonly JSON and existing public primitives.
- Produces: public `projectGcsTraitsV5` with trait leaf/container structure,
  path-aware validation, cycle detection, and depth enforcement.

- [ ] **Step 1: Write failing root and structural projection tests**

Require these exact outcomes:

```ts
expect(projectGcsTraitsV5({ version: 5 })).toBeUndefined();

const empty = projectGcsTraitsV5({ version: 5, traits: [] });
expect(empty).toEqual([]);
expect(Object.isFrozen(empty)).toBe(true);

expect(
  projectGcsTraitsV5({
    version: 5,
    traits: [
      { id: "TAAECAwQFBgcICQoL", children: [{ id: "tAAECAwQFBgcICQoL" }] },
    ],
  }),
).toEqual([
  {
    kind: "trait_container",
    id: "TAAECAwQFBgcICQoL",
    children: [{ kind: "trait", id: "tAAECAwQFBgcICQoL" }],
  },
]);
```

Assert every returned node and structural array is frozen and is not the input
object or array.

- [ ] **Step 2: Write failing path-aware error tests**

Cover non-array `/traits`, non-object `/traits/0`, missing and invalid IDs,
modifier IDs at trait paths, trait IDs in modifiers, leaf `children`, container
leaf-only fields, modifier-container leaf-only fields, active cycles, and depth 257. Assert the exact design error code and JSON-pointer path for every case.

- [ ] **Step 3: Run tests to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-projection-structure.test.ts \
  packages/gcs-engine/test/trait-projection-errors.test.ts
```

Expected: FAIL because `projectGcsTraitsV5` does not exist.

- [ ] **Step 4: Implement focused field readers**

In `fields.ts`, implement and export internal readers with exact paths:

```ts
export function requireRecord(
  value: unknown,
  code: "INVALID_TRAIT" | "INVALID_TRAIT_MODIFIER",
  path: string,
): Record<string, unknown>;

export function readRequiredNodeTid(
  record: Record<string, unknown>,
  path: string,
  allowed: readonly TidKind[],
): { readonly id: Tid; readonly kind: TidKind };

export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined;

export function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
): boolean | undefined;
```

`readRequiredNodeTid` wraps invalid syntax as `INVALID_FIELD` at `/id` and a
valid but disallowed kind as `INVALID_NODE_KIND`. Readers distinguish absent
properties from present `null` or `undefined`.

- [ ] **Step 5: Implement recursive trait structure**

Use exact wire-field sets:

```ts
const TRAIT_LEAF_ONLY_FIELDS = Object.freeze([
  "base_points",
  "points_per_level",
  "levels",
  "round_down",
  "can_level",
  "study",
  "study_hours_needed",
  "features",
  "weapons",
] as const);

const TRAIT_CONTAINER_ONLY_FIELDS = Object.freeze([
  "ancestry",
  "template_picker",
  "container_type",
  "children",
] as const);
```

Root traits are depth 1. Guard every active trait object with a `WeakSet` and a
`try/finally`. Accept `t` as `kind: "trait"` and `T` as
`kind: "trait_container"`. Leaves reject present container-only fields;
containers reject present leaf-only fields. Containers project `children`
recursively, preserving absent versus empty. Freeze every node.

- [ ] **Step 6: Implement recursive modifier structure**

Accept only `m` and `M` below a trait's `modifiers`. Modifier leaves reject
`children`; modifier containers reject this exact leaf-only set:

```ts
const MODIFIER_LEAF_ONLY_FIELDS = Object.freeze([
  "cost_adj",
  "use_level_from_trait",
  "show_notes_on_weapon",
  "affects",
  "features",
  "levels",
  "disabled",
] as const);
```

Preserve absent/empty modifier and modifier-child arrays, use the same active
ancestor set and depth counter, and freeze all results.

- [ ] **Step 7: Verify GREEN and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-projection-structure.test.ts \
  packages/gcs-engine/test/trait-projection-errors.test.ts
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src packages/gcs-engine/test
git commit -m "feat: project strict trait tree structure"
```

Expected: structural, error, and type checks pass.

### Task 4: Complete Trait and Modifier Source Fields

**Files:**

- Modify: `packages/gcs-engine/src/traits/fields.ts`
- Modify: `packages/gcs-engine/src/traits/project.ts`
- Test: `packages/gcs-engine/test/trait-projection-fields.test.ts`
- Test: `packages/gcs-engine/test/trait-projection-numbers.test.ts`

**Interfaces:**

- Consumes: Task 3 structural projection and all existing primitive parsers.
- Produces: the complete approved typed field surface, safe Fxp conversion,
  sources, study records, strict enums, replacement maps, and opaque JSON.

- [ ] **Step 1: Write a failing complete-field synthetic projection test**

Build one trait container with one trait leaf, one modifier container, and one
modifier leaf. Populate every field named in the design with non-zero canonical
values. Require camel-case output, exact `Fxp` raw values, exact enum values,
same-kind source IDs, frozen sources/studies/maps/opaque arrays/objects, and no
aliasing after mutating the input.

Use canonical IDs with payload `AAECAwQFBgcICQoL` and kinds `T`, `t`, `M`,
and `m`. Use `1.25`, `2.5`, `3.75`, and `4` as fixed-point inputs.

- [ ] **Step 2: Write failing fixed-point safety tests**

Require safe boundaries `900719925474.0991` and `-900719925474.0991` to
project. Require these to fail with `UNSAFE_FXP_NUMBER` at the exact field:

```text
900719925474.0992
-900719925474.0992
1.23456
NaN
Infinity
```

Because `NaN` and `Infinity` cannot come from JSON text, construct those two
documents programmatically.

- [ ] **Step 3: Write failing strict field error tests**

For every reader category, include at least one wrong type and exact path:
string, boolean, string array, string map, opaque object, opaque array, source,
study, Fxp, and every selected enum domain. Include a source TID whose kind does
not match its enclosing node.

- [ ] **Step 4: Run tests to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-projection-fields.test.ts \
  packages/gcs-engine/test/trait-projection-numbers.test.ts
```

Expected: FAIL because Task 3 projects only structure and IDs.

- [ ] **Step 5: Implement safe Fxp and strict enum readers**

`readOptionalFxp` accepts only a finite number, calls `parseFxp(String(value))`,
checks `fxpToRaw` against `BigInt(Number.MIN_SAFE_INTEGER)` and
`BigInt(Number.MAX_SAFE_INTEGER)`, and requires
`Number(formatFxp(parsed)) === value`. Wrap every failure as
`UNSAFE_FXP_NUMBER`.

Implement a generic internal enum reader that calls the specifically named
strict parser supplied by the caller and wraps `GcsPrimitiveError` as
`INVALID_FIELD`. Do not call any `normalize...` function.

- [ ] **Step 6: Implement composite readers**

Implement exact readers for:

```text
optional readonly string[]
optional readonly Record<string, string>
optional opaque object
optional opaque array
optional Source(library, path, id)
optional readonly Study[] (required type and hours, optional note)
```

Source requires all three properties, validates strings, validates TID, and
requires the enclosing kind. Study uses `parseStudyType` and safe Fxp hours.
All composite results are cloned and frozen.

- [ ] **Step 7: Map all approved wire fields**

Use this exact wire-to-public mapping (unchanged snake-case names map to the
same words in camel case):

```text
id -> id
source -> source
name -> name
reference -> reference
reference_highlight -> referenceHighlight
local_notes -> localNotes
tags -> tags
prereqs -> prerequisites
self_control_roll -> selfControlRoll
self_control_adjustment -> selfControlAdjustment
frequency -> frequency
disabled -> disabled
vtt_notes -> vttNotes
user_description -> userDescription
replacements -> replacements
modifiers -> modifiers
third_party -> thirdParty
calc -> calc
base_points -> basePoints
points_per_level -> pointsPerLevel
levels -> levels
round_down -> roundDown
can_level -> canLevel
study -> study
study_hours_needed -> studyHoursNeeded
features -> features
weapons -> weapons
ancestry -> ancestry
template_picker -> templatePicker
container_type -> containerType
children -> children
cost_adj -> costAdjustment
use_level_from_trait -> useLevelFromTrait
show_notes_on_weapon -> showNotesOnWeapon
affects -> affects
```

Build internal mutable
builders with a local generic `Mutable<T>` type; assign a property only when
the wire property exists, then freeze and return it as the public readonly
type. Do not emit own properties whose wire fields were absent.

- [ ] **Step 8: Verify GREEN and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-projection-structure.test.ts \
  packages/gcs-engine/test/trait-projection-errors.test.ts \
  packages/gcs-engine/test/trait-projection-fields.test.ts \
  packages/gcs-engine/test/trait-projection-numbers.test.ts
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src packages/gcs-engine/test
git commit -m "feat: project typed trait source fields"
```

Expected: all trait projection unit and type tests pass.

### Task 5: Fixture and Integration Coverage

**Files:**

- Create: `packages/gcs-engine/test/trait-projection-fixtures.test.ts`
- Modify: `packages/gcs-engine/test/public-api.test.ts`
- Modify: `tests/package-smoke.mjs`

**Interfaces:**

- Consumes: complete TypeScript projection from Tasks 2-4 and committed v5
  fixtures.
- Produces: proof that real characters, built exports, absence semantics, and
  generic serialization coexist.

- [ ] **Step 1: Add fixture integration tests**

For each manifest fixture, read the file, call `parseGcsV5`, snapshot a deep
clone of the generic document, project traits, and require:

```ts
expect(projected).toBeDefined();
expect(projected!.length).toBeGreaterThan(0);
expect(document).toEqual(before);
expect(serializeGcsV5(document)).toBe(serializeGcsV5(before));
```

Traverse every projected node and require runtime freezing. Count at least one
trait container, trait leaf, modifier leaf, and nested child across the full
three-fixture set.

- [ ] **Step 2: Run fixture tests**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-projection-fixtures.test.ts
```

Expected: PASS. If it fails, add the missing focused failing unit case before
changing production code, then repeat RED-GREEN for that behavior.

- [ ] **Step 3: Extend public and built-package smoke tests**

Require `projectGcsTraitsV5`, `GcsTraitProjectionError`, and
`GCS_TRAIT_PROJECTION_MAX_DEPTH` from the package root and from built `dist`.
Project a one-leaf document and verify `kind`, ID, and `basePoints` raw value.

- [ ] **Step 4: Verify and commit**

```sh
docker compose run --rm toolchain pnpm test:unit
docker compose run --rm toolchain pnpm build
docker compose run --rm toolchain pnpm test:package
git add packages/gcs-engine/test tests/package-smoke.mjs
git commit -m "test: cover trait projection integration"
```

Expected: unit, build, and package smoke pass.

### Task 6: Pinned Go Traits Oracle

**Files:**

- Create: `tools/gcs-traits-oracle/go.mod`
- Create: `tools/gcs-traits-oracle/go.sum`
- Create: `tools/gcs-traits-oracle/cmd/gcs-traits-oracle/main.go`
- Create: `tools/gcs-traits-oracle/cmd/gcs-traits-oracle/main_test.go`
- Create: `tools/gcs-traits-oracle/internal/oracle/protocol.go`
- Create: `tools/gcs-traits-oracle/internal/oracle/protocol_test.go`
- Create: `tools/gcs-traits-oracle/internal/oracle/project.go`
- Create: `tools/gcs-traits-oracle/internal/oracle/project_test.go`

**Interfaces:**

- Consumes: pinned GCS trait, modifier, source, study, enum, Fxp, and TID APIs.
- Produces: JSONL `traits.project` returning an independent recursive known-field
  source projection with raw fixed-point strings.

- [ ] **Step 1: Create the pinned module and failing protocol tests**

Copy exact GCS and Toolbox requirements from the primitive oracle `go.mod`.
Test one valid request, malformed JSON, missing/blank/duplicate IDs, missing
document, and unknown operations. Expected invalid envelopes are process-level
errors, not success responses.

Use this request shape:

```go
type request struct {
	ID       string          `json:"id"`
	Op       string          `json:"op"`
	Document json.RawMessage `json:"document"`
}
```

The only operation is `traits.project`.

- [ ] **Step 2: Run protocol tests to verify RED**

```sh
docker compose run --rm toolchain go -C tools/gcs-traits-oracle test ./... -v
```

Expected: FAIL because the module implementation is absent.

- [ ] **Step 3: Implement the fail-closed JSONL process**

Read stdin with `bufio.Scanner` using a finite 16 MiB buffer. Reject blank
records and malformed envelopes. Track IDs in a map and reject duplicates.
For each valid line, return exactly one JSON response with the same ID. Any
internal or envelope failure prints a concise message to stderr and exits
non-zero; do not continue after failure.

- [ ] **Step 4: Write failing source projection tests**

Use a canonical synthetic v5 document containing all four node kinds, non-zero
direct scalar fields, source, study, modifiers, and children. Assert the oracle
projection contains:

```text
kind and id
source library/path/id
all direct strings and booleans
tags and replacements
all selected enum keys/numbers
Fxp fields as raw decimal strings
recursive children and modifiers
presence booleans for structural arrays
```

Do not include `calc`, features, prerequisites, weapons, or template-picker
contents in the oracle result. Add one real committed fixture test.

- [ ] **Step 5: Implement projection directly from pinned GCS structs**

Decode a wrapper containing `Version` and `[]*gurps.Trait` using the JSON package
used by pinned GCS so its custom unmarshal methods run. Reject versions other
than 5. Recursively inspect `Trait.Container()` and
`TraitModifier.Container()`. Copy direct source fields from the pinned structs,
convert enum values with `.Key()` or integer value, convert every `fxp.Int` to
raw `int64` decimal text, and include explicit booleans recording whether
`children` and `modifiers` were present in the decoded canonical tree.

Keep each Go file below 500 lines. Use focused helper functions for common
fields; do not copy GCS calculation logic or reproduce TypeScript validators.

- [ ] **Step 6: Add CLI process tests and verify GREEN**

Test successful JSONL output, malformed request non-zero exit, and unknown op
non-zero exit through the real command. Then run:

```sh
docker compose run --rm toolchain go -C tools/gcs-traits-oracle test ./...
git add tools/gcs-traits-oracle
git commit -m "test: add pinned traits oracle"
```

Expected: all new Go tests pass.

### Task 7: TypeScript-to-Go Trait Conformance and Canonical Gate

**Files:**

- Create: `tests/traits/oracle-protocol.ts`
- Create: `tests/traits/oracle-runner.ts`
- Create: `tests/traits/oracle-runner.test.ts`
- Create: `tests/traits/conformance-shape.ts`
- Create: `tests/traits/conformance.test.ts`
- Modify: `docker/toolchain.Dockerfile`
- Modify: `package.json`

**Interfaces:**

- Consumes: Tasks 4-6 TypeScript projection and Go `traits.project`.
- Produces: `test:traits-oracle`, `test:traits-conformance`, Docker-built traits
  oracle, and inclusion in `pnpm check`.

- [ ] **Step 1: Write failing response and process-runner tests**

Define strict success/error response parsing. The finite batch runner sends one
JSONL request per document, requires terminal newline, rejects blank records,
invalid JSON, wrong shapes, duplicate/unknown/missing IDs, signals, timeouts,
spawn errors, non-zero status, and response-count mismatch. Restore request
order by ID.

The default command inside canonical Docker is `gcs-traits-oracle`; tests inject
`process.execPath` fixtures. Use a 30-second timeout and 16 MiB max buffer.

- [ ] **Step 2: Run runner tests to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run tests/traits/oracle-runner.test.ts
```

Expected: FAIL because the traits runner does not exist.

- [ ] **Step 3: Implement the strict batch runner**

Follow the validated behavior of `tests/primitives/oracle-runner.ts` while using
the traits protocol and installed binary. Do not accept partial success. Cover
every implemented failure branch named in Step 1.

- [ ] **Step 4: Write failing conformance tests**

For each committed fixture and the complete synthetic document from Task 4:

1. Send the original document text to Go `traits.project`.
2. Parse through `parseGcsV5` and call `projectGcsTraitsV5`.
3. Convert TypeScript to the oracle shape, using `fxpToRaw(...).toString()`.
4. Normalize GCS zero values in the comparison shape because Go in-memory
   structs do not retain omitted-versus-explicit-zero presence.
5. Recursively sort object keys and require semantic equality.

On mismatch include fixture/request ID and JSON pointer to the first differing
value.

- [ ] **Step 5: Build the oracle into the toolchain image**

Add the module download/build stages beside the two existing oracles, copy
`gcs-traits-oracle` into `/usr/local/bin`, and keep both base image digests
unchanged.

Add scripts:

```json
"test:traits-oracle": "go -C tools/gcs-traits-oracle test ./...",
"test:traits-conformance": "vitest run tests/traits"
```

Insert both after primitive conformance prerequisites and before build in the
root `check` chain.

- [ ] **Step 6: Verify GREEN and commit**

```sh
docker compose build toolchain
docker compose run --rm toolchain pnpm install --frozen-lockfile
docker compose run --rm toolchain pnpm test:traits-oracle
docker compose run --rm toolchain pnpm test:traits-conformance
docker compose run --rm toolchain pnpm typecheck
git add tests/traits docker/toolchain.Dockerfile package.json
git commit -m "test: prove typed trait conformance"
```

Expected: Go oracle, differential tests, and type checks pass.

### Task 8: Documentation, Licensing, and Final Acceptance

**Files:**

- Modify: `README.md`
- Modify: `packages/gcs-engine/README.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `tests/package-smoke.mjs` if new examples require additional built
  assertions.

**Interfaces:**

- Consumes: complete typed projection and all verification commands.
- Produces: user-facing contract, provenance, final clean diff, and canonical
  acceptance evidence.

- [ ] **Step 1: Update documentation and notices**

Document:

```text
projectGcsTraitsV5 usage and return type
four TID-discriminated node kinds
strict errors with JSON-pointer paths
safe real range -900719925474.0991..900719925474.0991
deep runtime immutability
opaque derived calc and complex payloads
requirement to retain the original document for serialization
no mutation, write-back, calculation, or migration behavior
test-only traits oracle pins and MPL-2.0 provenance
the next engine slice boundary
```

- [ ] **Step 2: Run focused documentation and package checks**

```sh
docker compose run --rm toolchain pnpm format:check
docker compose run --rm toolchain pnpm build
docker compose run --rm toolchain pnpm test:package
```

Expected: formatting, build, and built-package smoke pass.

- [ ] **Step 3: Run the complete canonical gate fresh**

```sh
docker compose run --rm toolchain pnpm check
```

Expected: format, lint, typecheck, all three Go oracle suites, document,
primitive, and trait conformance, build, package smoke, dependency tree, and
production audit all pass with zero failures and no high/critical findings.

- [ ] **Step 4: Review the complete diff and acceptance criteria**

```sh
git diff --check 7ce5b242c06684b388f6947536b9d5fad32c042b...HEAD
git diff --stat 7ce5b242c06684b388f6947536b9d5fad32c042b...HEAD
git status --short
```

Confirm no secrets, host paths, runtime dependencies, mutable projection
aliases, generated corpus, unrelated refactor, or source file above 500 lines.

- [ ] **Step 5: Commit documentation**

```sh
git add README.md packages/gcs-engine/README.md THIRD_PARTY_NOTICES.md tests/package-smoke.mjs
git commit -m "docs: document typed trait projection"
```

- [ ] **Step 6: Request task-independent whole-branch review**

Generate a Superpowers review package from exact base
`7ce5b242c06684b388f6947536b9d5fad32c042b` to `HEAD`. Dispatch the final
reviewer with the approved design, this plan, the review package, canonical
gate evidence, and any recorded Minor findings. Fix every Critical or Important
finding through a test-first fix subagent and re-review.

- [ ] **Step 7: Run final post-review verification**

```sh
docker compose run --rm toolchain pnpm check
git diff --check 7ce5b242c06684b388f6947536b9d5fad32c042b...HEAD
git status --short --branch
```

Expected: full gate exits 0, diff check is clean, and the feature branch has no
uncommitted files.
