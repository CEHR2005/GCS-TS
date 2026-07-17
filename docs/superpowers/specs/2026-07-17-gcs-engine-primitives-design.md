# GCS Engine Primitives Conformance Design

**Date:** 2026-07-17

**Status:** Approved

**Upstream baseline:** GCS v5.44.0, GCS Master Library v5.12.0, Toolbox v2.15.0

## Goal

Add the smallest dependency-driven primitive layer needed by the next traits and
trait-modifiers slice. The production package remains TypeScript-only and gains
fixed-point values, typed IDs, and only the persisted enums used directly by
traits and trait modifiers. A separate test-only Go oracle proves observable
compatibility with the pinned GCS implementation.

This slice does not implement typed trait models, trait mutation, cost
calculation, recalculation, UI, persistence, or older GCS data versions.

## Architectural boundary

All production code remains inside `packages/gcs-engine` and has no runtime
dependencies. New code is grouped by responsibility:

- `src/fxp/` owns decimal fixed-point parsing, formatting, arithmetic, bounds,
  and rounding;
- `src/tid/` owns typed-ID validation, kind checks, and cryptographic ID
  generation;
- `src/enums/` owns the selected persisted enum values, strict parsing, and
  compatibility normalization;
- the package root re-exports the supported public API explicitly.

The existing `parseGcsV5` and `serializeGcsV5` contracts remain unchanged.
They continue to preserve a generic lossless JSON document and do not
automatically replace JSON values with primitive wrappers. Typed document
adapters belong to the later traits slice.

The primitive APIs use functions and branded values rather than mutable
classes. This keeps runtime output small, prevents accidental mixing of raw
`bigint` and fixed-point values at compile time, and works in both Node and
modern browsers.

### Public API sketch

The implementation plan must preserve this naming and type direction unless a
test against pinned upstream exposes a material flaw:

```ts
declare const fxpBrand: unique symbol;
export type Fxp = bigint & { readonly [fxpBrand]: "Fxp" };

export const FXP_SCALE: bigint;
export const FXP_MIN_RAW: bigint;
export const FXP_MAX_RAW: bigint;

export function fxpFromRaw(raw: bigint): Fxp;
export function fxpToRaw(value: Fxp): bigint;
export function fxpFromInteger(value: bigint): Fxp;
export function parseFxp(input: string): Fxp;
export function formatFxp(value: Fxp): string;
export function addFxp(left: Fxp, right: Fxp): Fxp;
export function subtractFxp(left: Fxp, right: Fxp): Fxp;
export function multiplyFxp(left: Fxp, right: Fxp): Fxp;
export function divideFxp(left: Fxp, right: Fxp): Fxp;
export function moduloFxp(left: Fxp, right: Fxp): Fxp;
export function absFxp(value: Fxp): Fxp;
export function truncateFxp(value: Fxp): Fxp;
export function floorFxp(value: Fxp): Fxp;
export function ceilFxp(value: Fxp): Fxp;
export function roundFxp(value: Fxp): Fxp;
export function minFxp(left: Fxp, right: Fxp): Fxp;
export function maxFxp(left: Fxp, right: Fxp): Fxp;
export function applyFxpRounding(value: Fxp, roundDown: boolean): Fxp;

declare const tidBrand: unique symbol;
export type Tid = string & { readonly [tidBrand]: "Tid" };
export type TidKind = "t" | "T" | "m" | "M";
export type TidRandomSource = () => Uint8Array;

export function parseTid(input: string): Tid;
export function isTid(input: string): input is Tid;
export function getTidKind(tid: Tid): TidKind;
export function assertTidKind(tid: Tid, expected: TidKind): void;
export function generateTid(kind: TidKind, randomSource?: TidRandomSource): Tid;
```

The seven enum domains are exported as readonly value tables plus derived union
types named `TraitContainerType`, `TraitModifierAffects`, `SelfControlRoll`,
`SelfControlAdjustment`, `FrequencyRoll`, `StudyLevel`, and `StudyType`. Each
domain exports a specifically named strict parser and compatibility normalizer,
for example `parseTraitContainerType` and `normalizeTraitContainerType`. This is
intentionally explicit rather than a public generic enum registry.

The brand symbols are implementation-private compile-time declarations; they
are not runtime fields or public values.

## Fixed-point contract

`Fxp` is an opaque branded `bigint` whose raw value uses four decimal places:

- scale: `10_000`;
- raw storage range: signed 64-bit, from `-9223372036854775808` through
  `9223372036854775807`;
- parsing accepts an optional sign, grouping commas, decimal input, and the
  exponent notation accepted by pinned GCS;
- input beyond four decimal places is truncated toward zero;
- canonical formatting omits grouping separators, unnecessary trailing zeroes,
  and the decimal point for whole values;
- malformed or out-of-range textual input is rejected rather than converted to
  zero.

The public surface provides constants and functions for checked construction
from raw and integer values, raw extraction, parse/format, add, subtract,
multiply, divide, modulo, absolute value, truncation, floor, ceiling,
half-away-from-zero rounding, minimum, maximum, and GCS `ApplyRounding`
semantics.

Observable edge behavior follows GCS v5.44.0:

- multiplication and scaled division use integer arithmetic and truncate toward
  zero;
- multiplication, and rounding near the signed-64 boundaries, saturate to the
  nearest boundary where GCS saturates;
- arithmetic paths that use native signed-64 addition or subtraction reproduce
  signed-64 wrapping rather than JavaScript's unbounded `bigint` behavior;
- modulo has the sign of the dividend;
- half values round away from zero;
- divide or modulo by zero raises a typed error instead of reproducing a Go
  panic;
- checked constructors and textual parsing reject values that cannot be
  represented.

No floating-point number is used as the production source of truth. An
unavoidable exponent-input compatibility path must be covered by oracle tests,
including its pinned GCS precision limitations.

## TID contract

`Tid` is an opaque branded string. A valid GCS TID is exactly 17 URL-safe
characters:

- character 1 is a recognized kind;
- characters 2–17 are the unpadded raw URL-safe Base64 encoding of exactly 12
  random bytes;
- the payload therefore contains 96 bits of entropy.

This slice supports only kinds needed by traits and trait modifiers:

| Kind | Meaning                  |
| ---- | ------------------------ |
| `t`  | trait                    |
| `T`  | trait container          |
| `m`  | trait modifier           |
| `M`  | trait modifier container |

The public surface validates a TID, checks or narrows its kind, and generates a
new TID for an allowed kind. Generation uses
`globalThis.crypto.getRandomValues` by default. Tests inject an exact 12-byte
provider so deterministic vectors do not weaken production randomness. Missing
cryptographic randomness is an explicit error; `Math.random` is never a
fallback.

Compatibility requires the same format, allowed kinds, payload validation, and
entropy as Toolbox v2.15.0. It does not require generating the same random IDs
as Go.

## Selected persisted enums

Only enums required directly by the next traits and trait-modifiers slice are
included:

- trait container type;
- trait-modifier affects target;
- self-control roll;
- self-control adjustment;
- frequency roll;
- study level;
- study type.

Canonical serialized values, numeric roll values, ordering, defaults, and the
legacy `race` alias for container type `ancestry` follow GCS v5.44.0. UI labels,
translations, descriptions, and desktop presentation state are excluded.

Each string-keyed enum exposes two distinct paths:

1. A strict parser accepts only canonical persisted keys and otherwise raises
   `INVALID_ENUM`.
2. A GCS-compatible normalizer performs case-insensitive matching, accepts
   pinned legacy aliases, and applies the pinned GCS default for unknown input.
   It returns the normalized value together with an explicit diagnostic:
   `LEGACY_ALIAS` or `FALLBACK_DEFAULT`.

This split preserves import compatibility without making GCS's silent fallback
behavior invisible to callers. Numeric roll enums follow the same principle:
strict validation rejects unknown values, while compatibility normalization
returns the pinned default plus `FALLBACK_DEFAULT`.

## Compatibility policy

The target is semantic interoperability, not a line-by-line TypeScript copy of
the Go implementation.

Exact observable compatibility is required for:

- GCS v5 persisted wire values;
- fixed-point parsing, canonical formatting, arithmetic, rounding, boundary,
  and overflow outcomes used by calculations;
- TID length, alphabet, kind semantics, payload validation, and 96-bit entropy;
- canonical enum keys, numeric values, pinned legacy aliases, and pinned default
  behavior;
- results returned by the test-only Go oracle.

The implementation deliberately does not clone:

- Go package and concrete-type structure;
- panic-based APIs;
- forced parsers that silently return zero;
- GCS desktop labels, localization, or UI state;
- data-version support for GCS v1–v4 or v6+;
- calculation rules not required by these primitives.

## Errors and diagnostics

All primitive failures use one exported `GcsPrimitiveError` class with a stable
`code` and an optional path or contextual detail. The initial error-code union
is:

- `INVALID_FXP`;
- `FXP_OUT_OF_RANGE`;
- `DIVIDE_BY_ZERO`;
- `INVALID_TID`;
- `INVALID_TID_KIND`;
- `INVALID_ENUM`;
- `CRYPTO_UNAVAILABLE`.

Expected invalid input is represented by these errors. Internal failures in the
Go oracle are process failures and must exit non-zero.

Compatibility normalization is not an error path. It returns a value plus an
optional structured diagnostic with code `LEGACY_ALIAS` or
`FALLBACK_DEFAULT`, the original input, and the canonical output. Callers can
therefore preserve GCS behavior while still surfacing repaired input.

## Test-only primitive oracle

Create a new `tools/gcs-primitives-oracle` Go CLI rather than extending the
existing document-normalization protocol. The existing `gcs-oracle` remains
stable and independently testable.

The primitive oracle is pinned to:

- `github.com/richardwilkes/gcs/v5` v5.44.0;
- `github.com/richardwilkes/toolbox/v2` v2.15.0;
- the repository's pinned Go toolchain.

It uses JSONL over stdin/stdout. Every request and response contains an `id`.
Operations cover:

- fixed-point parse, format, raw conversion, arithmetic, rounding, and bounds;
- TID validation and kind extraction;
- selected enum canonical keys, legacy aliases, normalization defaults, and
  domain helpers required to establish persisted semantics.

Raw fixed-point integers travel over JSON as decimal strings, never JSON
numbers. Expected domain errors return a stable category. Malformed requests,
unknown operations, impossible response encoding, and other internal failures
terminate the process non-zero and fail CI.

TID generation itself is tested in TypeScript with injected bytes. The
resulting ID is passed to the Go oracle for validation; randomness is not
compared byte-for-byte.

## Testing strategy

Implementation follows strict TDD in small increments. Each behavior starts
with a focused failing test, the failure is observed, the minimal production
code is added, and relevant tests are rerun before proceeding.

Required coverage includes:

- fixed-point valid and invalid text, signs, commas, exponent input, Unicode or
  whitespace rejection, decimal truncation, canonical formatting, signed-64
  minimum and maximum, overflow behavior, negative values around zero,
  divide-by-zero, modulo sign, and every rounding mode;
- deterministic differential vectors for arithmetic and rounding generated by
  a small repository-owned pseudo-random generator, with seeds recorded in test
  failures and no new runtime dependency;
- TID length, alphabet, payload decode, all four allowed kinds, wrong or unknown
  kinds, injected 12-byte generation vectors, and missing crypto;
- complete tables for all selected enums, case-insensitive compatibility input,
  `race` legacy mapping, invalid defaults, strict rejection, and diagnostics;
- Go oracle unit tests for successful operations, expected errors, malformed
  requests, and process failure;
- TypeScript-to-Go conformance for every selected operation;
- built-package export smoke tests proving the public API works from `dist`.

The canonical gate remains:

```sh
docker compose run --rm toolchain pnpm check
```

The root `check` script must include primitive unit tests, Go oracle tests,
differential conformance, formatting, lint, type checking, build, package smoke,
dependency-tree inspection, and the existing production audit. CI runs the same
Docker-first gate.

## Upstream source and fixture availability

No task may depend on a contributor-specific `~/app/dragon-reaper/GCS`, `/GCS`,
or another uncommitted host path.

The mandatory GCS fixtures are committed under `fixtures/gcs-v5/`. Their
upstream paths, v5.12.0 tag, MPL-2.0 provenance, and SHA-256 digests are recorded
in `fixtures/gcs-v5/manifest.json` and `THIRD_PARTY_NOTICES.md`. They are enough
for the canonical gate. The optional extended corpus continues to use a
read-only `GCS_CORPUS_DIR` mount and is not silently included in `pnpm check`.

The Go modules provide the source of truth needed by the primitive oracle. The
implementation plan and issue must point the agent to these pinned source
areas:

- GCS `model/fxp/int.go` and `model/fxp/int_test.go`;
- GCS `model/gurps/enums/affects`;
- GCS `model/gurps/enums/container`;
- GCS `model/gurps/enums/frequency`;
- GCS `model/gurps/enums/selfctrl`;
- GCS `model/gurps/enums/study`;
- GCS `model/kinds/kinds.go`;
- Toolbox `fixed/fixed64/int.go` and `int_test.go`;
- Toolbox `tid/tid.go` and its tests.

The agent may download and inspect those exact modules inside the canonical
container with the repository's `go.mod`; it must not substitute a moving
branch. If the pinned modules cannot be obtained and are not cached, the agent
must report a blocker instead of replacing the oracle, copying an unpinned
implementation, or weakening tests.

## Mandatory Superpowers handoff contract

The implementation issue is assigned to another agent and contains this hard
preflight gate:

1. Before inspecting implementation details or changing files, invoke the
   official `superpowers:using-superpowers` skill from
   `plugin://superpowers@openai-curated-remote`.
2. If Superpowers is unavailable, attempt to install that exact official plugin
   through the environment's supported plugin-install workflow.
3. If installation or skill invocation fails, make no implementation changes.
   Record the exact error and attempted steps, report the task as blocked, and,
   when issue-comment access is available, add the blocker to the issue.
4. Execute the written plan with the applicable Superpowers workflows,
   including `using-git-worktrees`, `executing-plans`,
   `subagent-driven-development`, `test-driven-development`,
   `systematic-debugging` for any unexpected failure,
   `verification-before-completion`, and `requesting-code-review`. Use
   `dispatching-parallel-agents` only after proving that the delegated tasks do
   not share files, mutable state, or an unresolved contract dependency.
5. Merely mentioning or detecting the plugin is insufficient. The work record
   must show plan execution checkpoints, subagent task review, and observed
   RED-to-GREEN TDD cycles. The primary implementing agent remains responsible
   for reviewing and integrating every subagent result.

No manual fallback is authorized when this preflight fails.

## Deliverables

- Runtime-dependency-free TypeScript primitive modules and explicit package
  exports.
- Focused TypeScript unit tests.
- A separate pinned Go primitive oracle with unit tests.
- Differential TypeScript-to-Go conformance tests.
- Updated build, package smoke, Docker image, root scripts, CI-compatible gate,
  and user-facing package documentation.
- MPL-2.0 notices for translated upstream behavior, with no licensing expansion
  beyond the existing `packages/gcs-engine` and upstream-derived test boundary.
- Any newly discovered stable engine rule proposed as a concise nested
  `packages/gcs-engine/AGENTS.md` candidate before editing that file.

## Out of scope

- Typed trait or trait-modifier document adapters.
- Trait cost calculations or `Recalculate` parity.
- Tree mutations, folders, drag-and-drop, context menus, search, or UI.
- Next.js, shadcn/ui, Prisma, PostgreSQL, or authentication.
- Import support for GCS data versions other than v5.
- A production dependency on Go or the oracle executables.
- Requiring or committing a full external GCS corpus.

## Acceptance criteria

- Existing `parseGcsV5` and `serializeGcsV5` behavior and tests remain intact.
- The published TypeScript package contains no runtime dependencies and no Go
  runtime requirement.
- Fixed-point, TID, and selected enum operations match the pinned oracle under
  the compatibility policy above.
- Unknown enum input can be handled compatibly only with a visible diagnostic;
  strict APIs reject it.
- Cryptographic TID generation never falls back to non-cryptographic randomness.
- Required tests use only committed fixtures and pinned modules; no host-specific
  GCS directory is required.
- The complete canonical Docker gate passes and CI invokes the same gate.
- The final diff stays inside this slice and receives Superpowers code review
  before completion is claimed.

## Implementation sequence

The detailed TDD implementation plan will be written only after this design is
reviewed. It should sequence the work as: oracle protocol and RED tests, fixed
point, TID, enums, differential conformance, public-package smoke, documentation,
and full verification. Each phase must remain independently reviewable and must
not begin the later traits slice.
