# GCS Trait Cost Calculation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a pure, immutable TypeScript kernel that calculates GCS v5 trait
current levels and adjusted point totals with differential proof against pinned
GCS v5.44.0.

**Architecture:** The new `traits/calculation` module consumes only the existing
readonly `GcsTraitNodeV5` projection. Focused helpers implement fixed-point
fraction and `cost_adj` compatibility; one recursive coordinator owns inherited
modifiers, disabled state, aggregation, cycle/depth guards, and freezing. The
test-only Go traits oracle gains a second operation that attaches decoded traits
to a minimal entity without running feature processing.

**Tech Stack:** TypeScript 6.0.3, Node 24.18.0, pnpm 11.13.1, Vitest 4.1.10,
Go 1.26.5, GCS v5.44.0, Toolbox v2.15.0, Docker Compose.

## Global Constraints

- The binding contract is
  `docs/superpowers/specs/2026-07-19-gcs-trait-cost-calculation-design.md`.
  Read it, the root `AGENTS.md`, and `packages/gcs-engine/AGENTS.md` completely
  before implementation.
- The issue solver must use `superpowers:subagent-driven-development`: a fresh
  implementer subagent per task, then a fresh spec-compliance reviewer, then a
  fresh code-quality reviewer. Inline `executing-plans` is not authorized for
  that solver unless the user later changes the issue.
- Invoke `superpowers:using-git-worktrees` before edits and work in an isolated
  worktree. Use strict RED-GREEN-REFACTOR and retain observed failure evidence.
- Invoke `superpowers:systematic-debugging` for every unexpected failure,
  `superpowers:verification-before-completion` before completion claims, and
  `superpowers:requesting-code-review` for the final whole-branch review.
- Production stays TypeScript-only, browser-compatible, dependency-free, and
  inside the MPL-2.0 `packages/gcs-engine` boundary. Go remains test-only.
- Consume `GcsTraitNodeV5`; do not traverse generic JSON, mutate the projection,
  reconstruct a document, write `calc`, or implement entity feature bonuses.
- Require the explicit boolean `useMultiplicativeModifiers`. Preserve order,
  TIDs, tree shape, and absent-versus-empty children in deeply frozen output.
- Match pinned permissive `cost_adj`, signed fixed-point behavior, modifier
  inheritance, disabled state, rounding, and container aggregation exactly.
- Root depth is 1; attempted depth 257 fails. Active-ancestor cycles fail;
  shared non-nested objects are independently calculated.
- No maintained production file may exceed 500 physical lines; target 350.
- Do not depend on `/GCS`, `~/app/dragon-reaper/GCS`, or another host corpus.
- Canonical verification is `docker compose run --rm toolchain pnpm check`.
- Do not edit an `AGENTS.md` without a separately approved exact candidate.
- After every task, run its review gate. Resolve accepted findings through a
  new RED-GREEN cycle before starting the next task.

---

### Task 1: Make Pinned Go Modules Available Offline

**Files:**

- Modify: `docker/toolchain.Dockerfile`
- Test: `tools/gcs-oracle/go.mod`
- Test: `tools/gcs-primitives-oracle/go.mod`
- Test: `tools/gcs-traits-oracle/go.mod`

**Outcome:** The built final toolchain image contains the builder module cache,
and every Go test runs with network module lookup disabled.

- [ ] **Step 1: Observe the current offline RED**

```sh
docker compose build toolchain
docker compose run --rm -e GOPROXY=off toolchain sh -c \
  'go -C tools/gcs-oracle test ./... && \
   go -C tools/gcs-primitives-oracle test ./... && \
   go -C tools/gcs-traits-oracle test ./...'
```

Expected: FAIL with a missing module and `module lookup disabled by GOPROXY=off`.
If it passes, inspect the image itself with `docker compose run --rm toolchain
sh -c 'test -d /go/pkg/mod && go env GOMODCACHE'`; do not rely on a host cache.

- [ ] **Step 2: Copy the resolved cache and lock runtime lookup**

Add this copy beside the existing Go binary copies:

```dockerfile
COPY --from=go-toolchain /go/pkg/mod /go/pkg/mod
```

Extend the final `ENV` block without changing build-stage downloads:

```dockerfile
ENV PATH="/usr/local/go/bin:${PATH}" \
    GOCACHE=/tmp/go-build \
    GOPROXY=off \
    GOEXPERIMENT=jsonv2 \
    CGO_ENABLED=1
```

- [ ] **Step 3: Rebuild and verify GREEN**

```sh
docker compose build toolchain
docker compose run --rm toolchain sh -c \
  'test -d /go/pkg/mod && test "$(go env GOPROXY)" = off && \
   go -C tools/gcs-oracle test ./... && \
   go -C tools/gcs-primitives-oracle test ./... && \
   go -C tools/gcs-traits-oracle test ./...'
```

Expected: PASS without a module download message.

- [ ] **Step 4: Review and commit**

Run the task spec and quality reviews, resolve findings, then:

```sh
git add docker/toolchain.Dockerfile
git commit -m "build: cache pinned Go modules offline"
```

### Task 2: Publish Calculation Types and Boundary Errors

**Files:**

- Create: `packages/gcs-engine/src/traits/calculation/types.ts`
- Create: `packages/gcs-engine/src/traits/calculation/errors.ts`
- Create: `packages/gcs-engine/src/traits/calculation/index.ts`
- Modify: `packages/gcs-engine/src/traits/index.ts`
- Modify: `packages/gcs-engine/src/index.ts`
- Test: `packages/gcs-engine/test/trait-calculation-types.test.ts`
- Test: `packages/gcs-engine/test/trait-calculation-errors.test.ts`

- [ ] **Step 1: Write failing package-root API tests**

Require the exact public types and `GcsTraitCalculationError` from the approved
spec. Test narrowing by `kind`, readonly children, no container `currentLevel`,
and this runtime boundary:

```ts
const error = new GcsTraitCalculationError(
  "INVALID_OPTIONS",
  "useMultiplicativeModifiers must be a boolean",
  "/options/useMultiplicativeModifiers",
);
expect(error).toMatchObject({
  name: "GcsTraitCalculationError",
  code: "INVALID_OPTIONS",
  path: "/options/useMultiplicativeModifiers",
});
```

- [ ] **Step 2: Verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-types.test.ts \
  packages/gcs-engine/test/trait-calculation-errors.test.ts
```

Expected: FAIL because the calculation exports do not exist.

- [ ] **Step 3: Implement the exact public declarations**

Use the API from the spec verbatim. `types.ts` imports `Fxp` and `Tid` as types.
`errors.ts` contains no additional public constant:

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
  ) {
    super(message);
    this.name = "GcsTraitCalculationError";
    this.code = code;
    this.path = path;
  }
}
```

Export the types and error through both index layers. Do not export a
stub calculator; Task 5 adds the public function only after its behavior tests
exist.

- [ ] **Step 4: Verify GREEN, review, and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-types.test.ts \
  packages/gcs-engine/test/trait-calculation-errors.test.ts
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src packages/gcs-engine/test
git commit -m "feat: define trait calculation API"
```

### Task 3: Implement Internal Fractions and `cost_adj` Compatibility

**Files:**

- Create: `packages/gcs-engine/src/traits/calculation/fraction.ts`
- Create: `packages/gcs-engine/src/traits/calculation/cost-adjustment.ts`
- Test: `packages/gcs-engine/test/trait-calculation-fraction.test.ts`
- Test: `packages/gcs-engine/test/trait-calculation-cost-adjustment.test.ts`

**Internal interface:**

```ts
type Fraction = Readonly<{ numerator: Fxp; denominator: Fxp }>;
type CostAdjustmentKind =
  "addition" | "percentage_adder" | "percentage_multiplier" | "multiplier";
type CostAdjustment = Readonly<{ kind: CostAdjustmentKind; value: Fraction }>;
```

- [ ] **Step 1: Write fraction RED tests**

Cover normalized signs, `0/n`, zero-denominator reset, add/multiply/divide/value,
and raw signed boundaries. Differential expectations must be taken from pinned
`fxp.Fraction`: `Normalize` fixes signs and zero denominators but deliberately
does not reduce a greatest common divisor.

```ts
expect(normalizeFraction({ numerator: raw(4), denominator: raw(-6) })).toEqual({
  numerator: raw(-4),
  denominator: raw(6),
});
expect(normalizeFraction({ numerator: raw(5), denominator: raw(0) })).toEqual({
  numerator: raw(0),
  denominator: raw(1),
});
```

- [ ] **Step 2: Write classifier/parser RED tests**

Use table-driven cases covering at least:

```ts
[
  ["+2", "addition", 2, 1],
  ["-10%", "percentage_adder", -10, 1],
  ["x50%", "percentage_multiplier", 50, 1],
  ["× 2/3", "multiplier", 2, 3],
  ["1.5x", "multiplier", 1.5, 1],
  ["+2 points", "addition", 2, 1],
  ["", "addition", 0, 1],
  ["-", "addition", 0, 1],
  ["x1/0", "multiplier", 0, 1],
  ["x-2", "multiplier", 1, 1],
  ["x-50%", "percentage_multiplier", 100, 1],
] as const;
```

Also prove that applying the leveled multiplier scales the numerator then
normalizes, and that an explicit `x2/3` remains two-thirds.

- [ ] **Step 3: Verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-fraction.test.ts \
  packages/gcs-engine/test/trait-calculation-cost-adjustment.test.ts
```

Expected: FAIL because both helpers are absent.

- [ ] **Step 4: Implement from pinned behavior**

Use only existing `Fxp` primitives. Preserve signed-64 wrapping/saturation at
the same operations as upstream; do not replace fixed-point operations with JS
floating point. Implement marker classification after `trim()`, strip trailing
non-digits as pinned `emweight.ExtractFraction` does, parse decimal or one slash,
and apply forced zero/denominator fallbacks. Keep helpers unexported from the
package root.

Required exports inside the internal files:

```ts
export function normalizeFraction(value: Fraction): Fraction;
export function addFractions(left: Fraction, right: Fraction): Fraction;
export function multiplyFractions(left: Fraction, right: Fraction): Fraction;
export function divideFractions(left: Fraction, right: Fraction): Fraction;
export function fractionValue(value: Fraction): Fxp;
export function parseCostAdjustment(input: string): CostAdjustment;
export function scaleCostAdjustment(
  adjustment: CostAdjustment,
  levelMultiplier: Fxp,
): CostAdjustment;
```

- [ ] **Step 5: Verify GREEN, review, and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-fraction.test.ts \
  packages/gcs-engine/test/trait-calculation-cost-adjustment.test.ts
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src/traits/calculation \
  packages/gcs-engine/test/trait-calculation-{fraction,cost-adjustment}.test.ts
git commit -m "feat: implement trait cost adjustment primitives"
```

### Task 4: Calculate Leaf Trait Points

**Files:**

- Create: `packages/gcs-engine/src/traits/calculation/leaf.ts`
- Test: `packages/gcs-engine/test/trait-calculation-leaf.test.ts`

**Internal interface:**

```ts
type LeafContext = Readonly<{
  effectivelyDisabled: boolean;
  inheritedModifiers: readonly GcsTraitModifierNodeV5[];
  useMultiplicativeModifiers: boolean;
}>;
export function calculateLeafTrait(
  trait: GcsTraitV5,
  context: LeafContext,
): GcsTraitCalculationV5;
```

- [ ] **Step 1: Write table-driven RED tests**

Cover absent values, `canLevel` false, positive and negative persisted levels,
disabled state, base/level additions, all `affects` values, positive/negative
percentages, the -80% floor, direct/percentage multipliers, ASCII/Unicode
markers, own/inherited/nested/disabled modifiers, leveled modifiers, CR,
frequency, additive/multiplicative mode, and ceiling/floor.

Include these invariants with a leveled trait whose base is 10, cost per level
is 2, and persisted level is -3:

```ts
expect(result.currentLevel).toBe(raw(0)); // negative persisted level
expect(result.adjustedPoints).toBe(raw(4)); // 10 + (2 * -3)
expect(Object.isFrozen(result)).toBe(true);
expect(input).toEqual(before);
```

Use pinned oracle-derived expected raw values, not hand-rounded decimal guesses.

- [ ] **Step 2: Verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-leaf.test.ts
```

Expected: FAIL because `calculateLeafTrait` is absent.

- [ ] **Step 3: Implement the pinned formula**

Traverse enabled modifier leaves depth-first through modifier containers. Apply
own modifiers, then each ancestor list supplied nearest-first. Set a modifier's
level multiplier to current trait level when `useLevelFromTrait`, otherwise its
persisted modifier level; minimum one. Accumulate base/level additions,
enhancements, limitations, and final multiplier independently.

Implement the branch order from pinned `gurps.AdjustedPoints`: if `canLevel` is
false zero levels and points-per-level; clamp each limitation at -80; combine
enhancement+limitation in additive mode or apply sequentially in multiplicative
mode; optimize equal base/level fractions only when structurally equal; apply
CR×frequency first in the final multiplier; finally use `applyFxpRounding`.
Freeze the returned object and never mutate a modifier to attach its trait.

- [ ] **Step 4: Verify GREEN, review, and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-leaf.test.ts
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src/traits/calculation/leaf.ts \
  packages/gcs-engine/test/trait-calculation-leaf.test.ts
git commit -m "feat: calculate leaf trait points"
```

### Task 5: Coordinate Recursive Calculation and Containers

**Files:**

- Create: `packages/gcs-engine/src/traits/calculation/calculate.ts`
- Modify: `packages/gcs-engine/src/traits/calculation/index.ts`
- Test: `packages/gcs-engine/test/trait-calculation-tree.test.ts`
- Modify: `packages/gcs-engine/test/public-api.test.ts`
- Modify: `tests/package-smoke.mjs`

- [ ] **Step 1: Write boundary and traversal RED tests**

Test undefined/empty root, invalid missing/non-boolean option, absent/empty
children, regular sum, alternative abilities (ties, zero, all-negative, and
per-child rounding), disabled ancestors, inherited container modifiers, order,
TIDs, deep freezing, no mutation, cycle at exact pointer, depth 256 success,
depth 257 failure, and shared-branch reuse success.

Import the function and calculation types through the package root in
`public-api.test.ts`. In `package-smoke.mjs`, calculate one leveled trait and one
container from the built package, assert raw final values, frozen output, and
the exported error class. Confirm `packages/gcs-engine/package.json` still has
no `dependencies` field.

```ts
expect(calculateGcsTraitPointsV5(undefined, options)).toBeUndefined();
expect(Object.isFrozen(calculateGcsTraitPointsV5([], options))).toBe(true);
expect(() => calculateGcsTraitPointsV5([], {} as never)).toThrowError(
  expect.objectContaining({
    code: "INVALID_OPTIONS",
    path: "/options/useMultiplicativeModifiers",
  }),
);
```

- [ ] **Step 2: Verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-tree.test.ts
docker compose run --rm toolchain sh -c 'pnpm build && pnpm test:package'
```

Expected: FAIL because the public recursive calculator and built export do not
exist.

- [ ] **Step 3: Implement recursive coordination**

Validate options before handling `undefined`. Maintain one active `WeakSet` and
remove nodes in `finally`. Paths start at `/traits/{index}` and append escaped
`children/{index}` segments. Pass `container.modifiers` before older inherited
lists. A disabled container propagates effective disablement but remains in the
result tree.

Regular containers sum child `adjustedPoints` with `addFxp`. Alternative
abilities start maximum and total at zero, select the first child equal to the
non-negative maximum for full cost, and add every other child at independently
ceiled 20%. This deliberately charges every child at 20% when all are negative.
Freeze each node, each present children array, and the root array.

- [ ] **Step 4: Verify GREEN, review, and commit**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/trait-calculation-{types,errors,leaf,tree}.test.ts
docker compose run --rm toolchain pnpm typecheck
docker compose run --rm toolchain sh -c 'pnpm build && pnpm test:package'
git add packages/gcs-engine/src packages/gcs-engine/test tests/package-smoke.mjs
git commit -m "feat: calculate trait trees"
```

### Task 6: Extend the Pinned Go Traits Oracle

**Files:**

- Modify: `tools/gcs-traits-oracle/internal/oracle/protocol.go`
- Create: `tools/gcs-traits-oracle/internal/oracle/calculate.go`
- Modify: `tools/gcs-traits-oracle/internal/oracle/protocol_test.go`
- Create: `tools/gcs-traits-oracle/internal/oracle/calculate_test.go`

**Protocol:** `traits.project` remains byte-contract compatible.
`traits.calculate` requires `id`, `op`, `document`, and
`use_multiplicative_modifiers`; success returns only calculation result fields
with raw fixed-point decimal strings.

- [ ] **Step 1: Write oracle RED tests**

Test successful leaf/container output in both modes, inherited modifiers,
zero entity-derived trait bonuses, malformed/missing/wrong-typed option,
unknown operation, extra fields, duplicate IDs, malformed JSON, and internal
decode failure. Require every invalid request to make the process return nonzero.

- [ ] **Step 2: Verify RED**

```sh
docker compose run --rm toolchain go -C tools/gcs-traits-oracle \
  test ./internal/oracle -run 'Calculate|Protocol' -v
```

Expected: FAIL because `traits.calculate` is unknown.

- [ ] **Step 3: Generalize strict request dispatch**

Decode a small envelope containing `id` and `op` without rejecting operation-
specific keys, reject blank/duplicate values, then strictly decode the complete
operation-specific request with `DisallowUnknownFields` and `requireEOF`. Model
`use_multiplicative_modifiers` as `*bool`, reject `nil`, and dereference only
after validation. Keep the existing `traits.project` response unchanged.

For calculation, unmarshal the document into `{ Version int; Traits
[]*gurps.Trait }`, require version 5, then wire exactly:

```go
entity := &gurps.Entity{}
entity.SheetSettings = gurps.FactorySheetSettings()
entity.SheetSettings.Entity = entity
entity.SheetSettings.UseMultiplicativeModifiers = *request.UseMultiplicativeModifiers
entity.Traits = wrapper.Traits
for _, trait := range entity.Traits {
	trait.SetDataOwner(entity)
}
```

Do not call `gurps.NewEntity()` or `entity.Recalculate()`: both would introduce
global defaults or feature processing. Pinned trait JSON unmarshal has already
restored child parent pointers; `SetDataOwner` links traits and modifiers to the
minimal entity. Recursively emit `Kind`, string TID, `CurrentLevel`,
`AdjustedPoints`, and present children using raw base-10 `fxp.Int` values.

- [ ] **Step 4: Verify GREEN, review, and commit**

```sh
docker compose run --rm toolchain pnpm test:traits-oracle
docker compose run --rm toolchain sh -c \
  'test "$(go env GOPROXY)" = off && go -C tools/gcs-traits-oracle test ./...'
git add tools/gcs-traits-oracle
git commit -m "test: add trait calculation oracle"
```

### Task 7: Add TypeScript Differential Conformance

**Files:**

- Create: `tests/trait-calculation/oracle-protocol.ts`
- Create: `tests/trait-calculation/oracle-runner.ts`
- Create: `tests/trait-calculation/oracle-runner.test.ts`
- Create: `tests/trait-calculation/vectors.ts`
- Create: `tests/trait-calculation/conformance-shape.ts`
- Create: `tests/trait-calculation/conformance.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write runner/protocol RED tests**

Require exact request keys and operation, exact response keys, terminal newline,
known unique IDs, response count, timeout, buffer limit, signal/nonzero exit,
invalid JSON, blank lines, unknown/duplicate/missing IDs, and stderr context.

- [ ] **Step 2: Write conformance RED tests**

For each vector, parse/project once, calculate in both modifier modes, and
compare to the corresponding oracle response after converting every raw decimal
string with `fxpFromRaw(BigInt(raw))`. Differential documents must already obey
GCS load-time invariants: explicitly set `can_level` where applicable and do not
use negative persisted levels, because pinned unmarshal repairs those values
while the typed-kernel contract intentionally does not. Cover those typed-only
cases in Task 4 unit tests. Include the remaining matrix from Tasks 3–5 and the
three committed Wang Laowu, Dragon, and Lich fixtures. Assert the source
projection is unchanged after both calculations.

- [ ] **Step 3: Verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run tests/trait-calculation
```

Expected: FAIL until protocol, runner, vectors, and any uncovered calculation
edge cases are complete. For any semantic mismatch, invoke systematic debugging
and add the minimal focused unit RED before changing production code.

- [ ] **Step 4: Implement strict harness and root command**

Add:

```json
"test:traits-calculation-conformance": "vitest run tests/trait-calculation"
```

Place it in `check` after `test:traits-conformance`. Reuse structural helpers
only by extracting a neutral test utility when that removes real duplication;
do not weaken exact-key validation in the existing projection runner.

- [ ] **Step 5: Verify GREEN, review, and commit**

```sh
docker compose run --rm toolchain pnpm test:traits-calculation-conformance
docker compose run --rm toolchain pnpm test:unit
docker compose run --rm toolchain pnpm typecheck
git add tests/trait-calculation package.json packages/gcs-engine
git commit -m "test: prove trait calculation conformance"
```

### Task 8: Complete Package and Repository Handoff

**Files:**

- Modify: `packages/gcs-engine/README.md`
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`

- [ ] **Step 1: Document the supported boundary**

Document projection-first usage, required modifier option, nil-entity semantics,
immutable result, no feature bonuses or `calc` write-back, v5-only support,
test-only Go oracle, pinned versions, and the Docker gate. Extend the notice's
pinned GCS list with `model/gurps/trait.go`, `trait_modifier.go`, and
`enums/emweight/`, and its Toolbox list with `fixed/fixed64/fraction.go`; never
copy upstream comments unnecessarily.

- [ ] **Step 2: Run targeted and canonical verification**

```sh
docker compose build toolchain
docker compose run --rm toolchain pnpm check
git diff --check
git status --short
```

Expected: formatting, lint, typecheck, all unit/Go/conformance suites, build,
package smoke, dependency tree, and production audit pass; diff check is clean.

- [ ] **Step 3: Final reviews and acceptance audit**

Run a fresh whole-branch spec-compliance review and a fresh whole-branch code-
quality review. Resolve every accepted finding through RED-GREEN. Re-run the
canonical gate after the final change and commit each review fix with a focused
message. Check every spec acceptance criterion, scope boundary, license
boundary, source pin, and Deviation Ledger entry.

- [ ] **Step 4: Commit the handoff**

```sh
git add README.md packages/gcs-engine/README.md THIRD_PARTY_NOTICES.md
git commit -m "docs: document trait cost calculation"
git status --short
```

Expected: clean worktree. Do not push, merge, or open a PR unless the issue or
operator explicitly authorizes that external action.

## Definition of Done

- All eight task commits exist with observed RED/GREEN evidence and completed
  task-level two-stage reviews.
- The exact approved public API is available from the built dependency-free
  package and returns deeply frozen results without mutating its input.
- Synthetic vectors and all three committed fixtures match pinned GCS in both
  modifier modes; legacy conformance remains green.
- Every Go suite passes with `GOPROXY=off` from the rebuilt final image.
- `docker compose run --rm toolchain pnpm check` passes after final review.
- Final report follows root `AGENTS.md`, contains the Deviation Ledger, and
  proposes any newly discovered durable instruction as an exact candidate
  rather than editing `AGENTS.md` without approval.
