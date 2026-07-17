# GCS Engine Primitives Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task-by-task,
> with `superpowers:executing-plans` as the orchestration fallback only when
> subagents cannot be started after Superpowers itself passed preflight. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime-dependency-free TypeScript fixed-point, TID, and selected
persisted-enum primitives with differential conformance against pinned GCS
v5.44.0 and Toolbox v2.15.0 Go code.

**Architecture:** `@gcs/gcs-engine` exposes functional branded primitives while
the existing generic `.gcs` parser remains unchanged. A new test-only
`gcs-primitives-oracle` JSONL process exposes pinned Go behavior; repository
tests compare deterministic TypeScript vectors to that oracle. The production
package never imports or executes Go.

**Tech Stack:** Node.js 24.18.0, pnpm 11.13.1, TypeScript 6.0.3, Vitest
4.1.10, Go 1.26.5, GCS v5.44.0, Toolbox v2.15.0, Docker Compose.

## Global Constraints

- Read the root instructions supplied with the task and
  `packages/gcs-engine/AGENTS.md` before changing files.
- Before inspecting implementation details or changing files, invoke
  `superpowers:using-superpowers` from
  `plugin://superpowers@openai-curated-remote`.
- If that plugin is unavailable, attempt to install that exact official plugin
  through the supported plugin installer. If installation or skill invocation
  fails, change nothing, report the exact failure and attempted actions, and
  comment on the issue when access permits. No manual fallback is authorized.
- Use `superpowers:using-git-worktrees` before implementation,
  `superpowers:subagent-driven-development` with a fresh implementation
  subagent per task and two-stage review, `superpowers:test-driven-development`
  for every behavior, `superpowers:systematic-debugging` for unexpected
  failures, `superpowers:verification-before-completion`, and
  `superpowers:requesting-code-review` before handoff.
- Use `superpowers:dispatching-parallel-agents` only for tasks proven not to
  share files, mutable state, or unresolved interfaces. The primary agent owns
  review and integration of every subagent result.
- The source of truth is GCS v5.44.0, Toolbox v2.15.0, and GCS Master Library
  v5.12.0. Do not use moving branches.
- Do not depend on `~/app/dragon-reaper/GCS`, `/GCS`, or any uncommitted host
  path. Mandatory fixtures are already committed in `fixtures/gcs-v5/`.
- `GCS_CORPUS_DIR` remains an optional, explicitly mounted extended-corpus input
  for `pnpm test:corpus`; its absence is neither a canonical-gate failure nor a
  silently skipped required check. Do not add it to `pnpm check`.
- Production `packages/gcs-engine` remains TypeScript-only with zero runtime
  dependencies and supports `.gcs` data version 5 only.
- Do not change `parseGcsV5` or `serializeGcsV5` semantics, recalculate
  characters, or create typed trait adapters in this slice.
- Preserve unknown fields and `third_party`; do not mutate committed fixtures.
- Translated engine behavior remains MPL-2.0 inside the existing package
  licensing boundary.
- Canonical validation is
  `docker compose run --rm toolchain pnpm check`; never replace it with a host
  check or weaken one of its stages.
- Do not add a production dependency, change the approved public API, or change
  the persisted-data contract without stopping for user approval.

## Required Preflight

- [ ] **Step 1: Prove Superpowers availability before repository work**

Invoke `superpowers:using-superpowers`, then load
`using-git-worktrees`, `subagent-driven-development`,
`test-driven-development`, `systematic-debugging`,
`verification-before-completion`, and `requesting-code-review` as their trigger
conditions arise. If any required skill cannot be invoked after the official
plugin installation attempt, stop with a clean worktree and report the blocker.

- [ ] **Step 2: Create an isolated worktree and record the baseline**

Use `superpowers:using-git-worktrees`, then run:

```sh
git status --short --branch
docker compose build toolchain
docker compose run --rm toolchain pnpm install --frozen-lockfile
docker compose run --rm toolchain pnpm check
```

Expected: clean feature worktree and all existing checks pass. If the baseline
fails, use `superpowers:systematic-debugging`, distinguish a pre-existing failure
from an environment problem, and do not begin Task 1 until it is resolved or
reported as blocking.

- [ ] **Step 3: Prove pinned upstream source availability**

Run this exact container check:

```sh
docker compose run --rm toolchain sh -c '
  go -C tools/gcs-oracle mod download &&
  gcs="$(go env GOMODCACHE)/github.com/richardwilkes/gcs/v5@v5.44.0" &&
  toolbox="$(go env GOMODCACHE)/github.com/richardwilkes/toolbox/v2@v2.15.0" &&
  test -f "$gcs/model/fxp/int.go" &&
  test -f "$gcs/model/gurps/enums/container/type_gen.go" &&
  test -f "$gcs/model/kinds/kinds.go" &&
  test -f "$toolbox/fixed/fixed64/int.go" &&
  test -f "$toolbox/tid/tid.go"
'
```

Expected: exit 0. If pinned sources cannot be downloaded or found, stop and
report the blocker. Do not copy code from a different tag or bypass oracle
tests.

---

### Task 1: Primitive Oracle Process and Stable JSONL Envelope

**Files:**

- Create: `tools/gcs-primitives-oracle/go.mod`
- Create in Task 2 when imports require it: `tools/gcs-primitives-oracle/go.sum`
- Create: `tools/gcs-primitives-oracle/internal/oracle/protocol.go`
- Test: `tools/gcs-primitives-oracle/internal/oracle/protocol_test.go`
- Create: `tools/gcs-primitives-oracle/cmd/gcs-primitives-oracle/main.go`
- Test: `tools/gcs-primitives-oracle/cmd/gcs-primitives-oracle/main_test.go`
- Modify: `docker/toolchain.Dockerfile`
- Modify: `package.json`

**Interfaces:**

- Consumes: Go 1.26.5 and the existing Docker toolchain pattern.
- Produces: a `gcs-primitives-oracle` executable accepting
  `{ "id": string, "op": string, "args": object }` JSONL and returning either
  `{ "id": string, "ok": true, "result": object }` or
  `{ "id": string, "ok": false, "category": string, "message": string }`.
  Malformed envelopes and unknown operations terminate the process non-zero.

- [ ] **Step 1: Create the dependency-free module and write failing protocol and process tests**

Create the initial module manifest without speculative requirements:

```go
module gcs-primitives-oracle

go 1.26.5
```

Create tests containing these exact assertions:

```go
func TestProcessLinePing(t *testing.T) {
	got, err := ProcessLine([]byte(`{"id":"p1","op":"meta.ping","args":{}}`))
	if err != nil {
		t.Fatal(err)
	}
	var response map[string]any
	if err = json.Unmarshal(got, &response); err != nil {
		t.Fatal(err)
	}
	if response["id"] != "p1" || response["ok"] != true {
		t.Fatalf("unexpected response: %s", got)
	}
}

func TestProcessLineRejectsMalformedRequests(t *testing.T) {
	for _, input := range []string{
		`not-json`,
		`{"op":"meta.ping","args":{}}`,
		`{"id":"p1","args":{}}`,
		`{"id":"p1","op":"missing","args":{}}`,
	} {
		if _, err := ProcessLine([]byte(input)); err == nil {
			t.Fatalf("expected failure for %s", input)
		}
	}
}
```

In `main_test.go`, feed two ping lines through `run`, assert two newline-delimited
responses, and feed an unknown operation after a valid line to assert `run`
returns an error instead of continuing.

- [ ] **Step 2: Run the tests to verify RED**

Run:

```sh
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle test ./...
```

Expected: FAIL with undefined `ProcessLine` and `run`, proving the tests reach
the intended missing behavior rather than failing on environment setup.

- [ ] **Step 3: Implement the minimal protocol**

Use this concrete envelope and dispatcher shape in `protocol.go`:

```go
type request struct {
	ID   *string          `json:"id"`
	Op   *string          `json:"op"`
	Args *json.RawMessage `json:"args"`
}

type response struct {
	ID       string          `json:"id"`
	OK       bool            `json:"ok"`
	Result   json.RawMessage `json:"result,omitempty"`
	Category string          `json:"category,omitempty"`
	Message  string          `json:"message,omitempty"`
}

func ProcessLine(line []byte) ([]byte, error) {
	var request request
	if err := json.Unmarshal(line, &request); err != nil {
		return nil, fmt.Errorf("decode request: %w", err)
	}
	if request.ID == nil || request.Op == nil || request.Args == nil {
		return nil, errors.New("decode request: id, op, and args are required")
	}
	result, category, message, err := dispatch(*request.Op, *request.Args)
	if err != nil {
		return nil, err
	}
	output := response{ID: *request.ID, Category: category, Message: message}
	if category == "" {
		output.OK = true
		encoded, marshalErr := json.Marshal(result)
		if marshalErr != nil {
			return nil, fmt.Errorf("encode result: %w", marshalErr)
		}
		output.Result = encoded
	}
	encoded, err := json.Marshal(output)
	if err != nil {
		return nil, fmt.Errorf("encode response: %w", err)
	}
	return encoded, nil
}

func dispatch(op string, args json.RawMessage) (any, string, string, error) {
	switch op {
	case "meta.ping":
		return map[string]int{"protocolVersion": 1}, "", "", nil
	default:
		return nil, "", "", fmt.Errorf("unsupported operation %q", op)
	}
}
```

Use the existing `tools/gcs-oracle/cmd/gcs-oracle/main.go` scanner pattern with
a finite request-size limit, per-line flushing, line-number context, stderr, and
non-zero exit. Keep the new `go.mod` dependency-free in this task; pinned direct
requirements are added only when Task 2 and Task 5 introduce real imports.

- [ ] **Step 4: Tidy the dependency-free module and verify GREEN**

Run:

```sh
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle mod tidy
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle test ./...
```

Expected: all primitive-oracle tests pass. A dependency-free Go module may not
produce `go.sum`; do not manufacture an empty checksum file.

- [ ] **Step 5: Integrate the oracle into Docker and root scripts**

Extend the Go stage to copy the primitive oracle's `go.mod` before its download,
copy both source trees, build `/usr/local/bin/gcs-primitives-oracle`, and copy
that binary into the final Node image. Task 2 adds `go.sum` to this Docker copy
after real pinned dependencies exist. Add:

```json
"test:primitives-oracle": "go -C tools/gcs-primitives-oracle test ./..."
```

Do not add it to `check` until Task 8 wires the complete slice.

- [ ] **Step 6: Rebuild and smoke-test the binary**

Run:

```sh
docker compose build toolchain
printf '%s\n' '{"id":"p1","op":"meta.ping","args":{}}' | \
  docker compose run --rm -T toolchain gcs-primitives-oracle
```

Expected: one success response with `protocolVersion: 1`.

- [ ] **Step 7: Commit Task 1**

```sh
git add docker/toolchain.Dockerfile package.json tools/gcs-primitives-oracle
git commit -m "test: add primitive conformance oracle protocol"
```

### Task 2: Pinned Go Fixed-Point Oracle Operations

**Files:**

- Create: `tools/gcs-primitives-oracle/internal/oracle/fxp.go`
- Test: `tools/gcs-primitives-oracle/internal/oracle/fxp_test.go`
- Modify: `tools/gcs-primitives-oracle/internal/oracle/protocol.go`
- Modify: `tools/gcs-primitives-oracle/go.mod`
- Generate: `tools/gcs-primitives-oracle/go.sum`
- Modify: `docker/toolchain.Dockerfile`

**Interfaces:**

- Consumes: Task 1's `dispatch` function and GCS `fxp.Int`.
- Produces: `fxp.parse`, `fxp.format`, `fxp.add`, `fxp.subtract`,
  `fxp.multiply`, `fxp.divide`, `fxp.modulo`, `fxp.abs`, `fxp.truncate`,
  `fxp.floor`, `fxp.ceil`, `fxp.round`, `fxp.min`, `fxp.max`, and
  `fxp.apply_rounding`. All raw values are signed decimal strings.

- [ ] **Step 1: Write failing table tests for every operation**

Use a table with these mandatory vectors:

```go
tests := []struct {
	op   string
	args string
	want string
}{
	{"fxp.parse", `{"input":"1,234.56789"}`, `{"raw":"12345678"}`},
	{"fxp.parse", `{"input":"1e-3"}`, `{"raw":"10"}`},
	{"fxp.format", `{"raw":"-12500"}`, `{"text":"-1.25"}`},
	{"fxp.add", `{"left":"9223372036854775807","right":"1"}`, `{"raw":"-9223372036854775808"}`},
	{"fxp.subtract", `{"left":"-9223372036854775808","right":"1"}`, `{"raw":"9223372036854775807"}`},
	{"fxp.multiply", `{"left":"9223372036854775807","right":"20000"}`, `{"raw":"9223372036854775807"}`},
	{"fxp.divide", `{"left":"-55000","right":"20000"}`, `{"raw":"-27500"}`},
	{"fxp.modulo", `{"left":"-55000","right":"20000"}`, `{"raw":"-15000"}`},
	{"fxp.abs", `{"value":"-12500"}`, `{"raw":"12500"}`},
	{"fxp.truncate", `{"value":"-19999"}`, `{"raw":"-10000"}`},
	{"fxp.floor", `{"value":"-10001"}`, `{"raw":"-20000"}`},
	{"fxp.ceil", `{"value":"10001"}`, `{"raw":"20000"}`},
	{"fxp.round", `{"value":"-15000"}`, `{"raw":"-20000"}`},
	{"fxp.min", `{"left":"1","right":"2"}`, `{"raw":"1"}`},
	{"fxp.max", `{"left":"1","right":"2"}`, `{"raw":"2"}`},
	{"fxp.apply_rounding", `{"value":"-10001","roundDown":true}`, `{"raw":"-20000"}`},
}
```

Also assert `fxp.parse` returns `invalid_fxp` for `" "`,
`fxp_out_of_range` for `"922337203685477.5808"`, and division/modulo by zero
return `divide_by_zero` without panicking.

- [ ] **Step 2: Run the targeted Go test to verify RED**

```sh
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle \
  test ./internal/oracle -run Fxp -v
```

Expected: FAIL because the fixed-point operations are not dispatched.

- [ ] **Step 3: Implement raw decoding and operation handlers**

Use `strconv.ParseInt(raw, 10, 64)` for protocol raw values and convert directly
to `fxp.Int`. Return raw results with
`strconv.FormatInt(int64(value), 10)`. Dispatch to pinned methods, not duplicated
Go arithmetic:

```go
switch op {
case "fxp.parse":
	return handleFxpParse(args)
case "fxp.format":
	return handleFxpFormat(args)
case "fxp.add", "fxp.subtract", "fxp.multiply", "fxp.divide",
	"fxp.modulo", "fxp.min", "fxp.max":
	return handleFxpBinary(op, args)
case "fxp.abs", "fxp.truncate", "fxp.floor", "fxp.ceil", "fxp.round":
	return handleFxpUnary(op, args)
case "fxp.apply_rounding":
	return handleFxpApplyRounding(args)
}
```

`handleFxpBinary` must call `left.Add`, `left.Sub`, `left.Mul`, `left.Div`,
`left.Mod`, `left.Min`, or `left.Max`. Check a zero right operand before `Div`
or `Mod`. `handleFxpUnary` must call the corresponding pinned method. Classify
text parse errors containing `out of range` as `fxp_out_of_range`; classify
other expected text failures as `invalid_fxp`. JSON shape errors remain process
failures.

Add `github.com/richardwilkes/gcs/v5 v5.44.0` as a direct module requirement.
After `go mod tidy`, Toolbox v2.15.0 will be pinned transitively by GCS. Update
the Docker manifest copy to include the now-generated primitive-oracle
`go.sum` before `go mod download`.

- [ ] **Step 4: Run Go tests and verify GREEN**

```sh
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle test ./...
```

Expected: all primitive-oracle tests pass, including malformed input and
divide-by-zero process survival.

- [ ] **Step 5: Commit Task 2**

```sh
git add docker/toolchain.Dockerfile tools/gcs-primitives-oracle
git commit -m "test: expose pinned GCS fixed point behavior"
```

### Task 3: TypeScript Fixed-Point Codec and Primitive Errors

**Files:**

- Create: `packages/gcs-engine/src/primitive-errors.ts`
- Create: `packages/gcs-engine/src/fxp/types.ts`
- Create: `packages/gcs-engine/src/fxp/codec.ts`
- Create: `packages/gcs-engine/src/fxp/index.ts`
- Modify: `packages/gcs-engine/src/index.ts`
- Test: `packages/gcs-engine/test/fxp-codec.test.ts`

**Interfaces:**

- Consumes: no runtime dependencies.
- Produces: `GcsPrimitiveError`, `GcsPrimitiveErrorCode`, `Fxp`,
  `FXP_SCALE`, `FXP_MIN_RAW`, `FXP_MAX_RAW`, `fxpFromRaw`, `fxpToRaw`,
  `fxpFromInteger`, `parseFxp`, and `formatFxp`.

- [ ] **Step 1: Write failing public codec tests**

Use package-root imports and these exact tables:

```ts
it.each([
  ["0", 0n, "0"],
  ["+", 0n, "0"],
  [".", 0n, "0"],
  [",", 0n, "0"],
  ["1,234.56789", 12_345_678n, "1234.5678"],
  ["-0.00019", -1n, "-0.0001"],
  ["1e-3", 10n, "0.001"],
  [
    "-922337203685477.5808",
    -9_223_372_036_854_775_808n,
    "-922337203685477.5808",
  ],
] as const)("parses and formats %s", (input, raw, output) => {
  const value = parseFxp(input);
  expect(fxpToRaw(value)).toBe(raw);
  expect(formatFxp(value)).toBe(output);
});

it.each(["", " ", "NaN", "1.2.3", "１２", "1e"])(
  "rejects malformed input %j",
  (input) => {
    expect(() => parseFxp(input)).toThrowError(
      expect.objectContaining({ code: "INVALID_FXP" }),
    );
  },
);

it("rejects signed-64 overflow", () => {
  expect(() => parseFxp("922337203685477.5808")).toThrowError(
    expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
  );
  expect(() => fxpFromRaw(9_223_372_036_854_775_808n)).toThrowError(
    expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
  );
  expect(fxpToRaw(fxpFromInteger(2n))).toBe(20_000n);
  expect(() => fxpFromInteger(922_337_203_685_478n)).toThrowError(
    expect.objectContaining({ code: "FXP_OUT_OF_RANGE" }),
  );
});
```

- [ ] **Step 2: Run the codec test to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/fxp-codec.test.ts
```

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Add the typed primitive error**

Implement exactly this stable code union and class shape:

```ts
export type GcsPrimitiveErrorCode =
  | "INVALID_FXP"
  | "FXP_OUT_OF_RANGE"
  | "DIVIDE_BY_ZERO"
  | "INVALID_TID"
  | "INVALID_TID_KIND"
  | "INVALID_ENUM"
  | "CRYPTO_UNAVAILABLE";

export class GcsPrimitiveError extends Error {
  readonly code: GcsPrimitiveErrorCode;
  readonly path?: string;

  constructor(code: GcsPrimitiveErrorCode, message: string, path?: string) {
    super(message);
    this.name = "GcsPrimitiveError";
    this.code = code;
    if (path !== undefined) this.path = path;
  }
}
```

- [ ] **Step 4: Implement branded raw values and decimal codec**

In `types.ts`, keep the symbol private and validate every public constructor:

```ts
declare const fxpBrand: unique symbol;
export type Fxp = bigint & { readonly [fxpBrand]: "Fxp" };
export const FXP_SCALE = 10_000n;
export const FXP_MIN_RAW = -(1n << 63n);
export const FXP_MAX_RAW = (1n << 63n) - 1n;

export function fxpFromRaw(raw: bigint): Fxp {
  if (raw < FXP_MIN_RAW || raw > FXP_MAX_RAW) {
    throw new GcsPrimitiveError(
      "FXP_OUT_OF_RANGE",
      "fixed-point value is outside signed 64-bit range",
    );
  }
  return raw as Fxp;
}
```

`parseFxp` must remove every comma, reject surrounding whitespace, and parse
decimal magnitude with `bigint`. Truncate the fraction using
`(fraction + "0000").slice(0, 4)`. Permit the pinned parser's `+`, `-`, `.`,
`+.`, `-.`, and comma-only zero forms. For input containing `e` or `E`, first
use a finite JavaScript `number`, reject magnitudes beyond the signed-64 real
range, render exactly five fractional digits, and pass that decimal text through
the same integer parser. This is the only allowed floating-point path.

`formatFxp` divides by `FXP_SCALE`, pads the absolute remainder to four digits,
removes trailing zeroes, and preserves `-` for negative fractions whose integer
part is zero. `fxpFromInteger` multiplies by `FXP_SCALE` and delegates to the
checked raw constructor; it must never wrap.

- [ ] **Step 5: Run codec tests and TypeScript checks**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/fxp-codec.test.ts
docker compose run --rm toolchain pnpm typecheck
```

Expected: codec tests and type checking pass. Confirm that no `number` appears
outside the explicitly documented exponent-input branch.

- [ ] **Step 6: Commit Task 3**

```sh
git add packages/gcs-engine/src packages/gcs-engine/test/fxp-codec.test.ts
git commit -m "feat: add fixed point parsing and formatting"
```

### Task 4: TypeScript Fixed-Point Arithmetic and Rounding

**Files:**

- Create: `packages/gcs-engine/src/fxp/arithmetic.ts`
- Modify: `packages/gcs-engine/src/fxp/index.ts`
- Test: `packages/gcs-engine/test/fxp-arithmetic.test.ts`

**Interfaces:**

- Consumes: Task 3's `Fxp`, raw conversion, scale, bounds, and primitive error.
- Produces: `addFxp`, `subtractFxp`, `multiplyFxp`, `divideFxp`, `moduloFxp`,
  `absFxp`, `truncateFxp`, `floorFxp`, `ceilFxp`, `roundFxp`, `minFxp`,
  `maxFxp`, and `applyFxpRounding`.

- [ ] **Step 1: Write failing arithmetic and boundary tests**

Create helpers `raw(value)` and `from(raw)` in the test and assert:

```ts
expect(raw(addFxp(from(FXP_MAX_RAW), from(1n)))).toBe(FXP_MIN_RAW);
expect(raw(subtractFxp(from(FXP_MIN_RAW), from(1n)))).toBe(FXP_MAX_RAW);
expect(raw(multiplyFxp(from(FXP_MAX_RAW), from(20_000n)))).toBe(FXP_MAX_RAW);
expect(raw(divideFxp(from(-55_000n), from(20_000n)))).toBe(-27_500n);
expect(raw(moduloFxp(from(-55_000n), from(20_000n)))).toBe(-15_000n);
expect(raw(absFxp(from(FXP_MIN_RAW)))).toBe(FXP_MIN_RAW);
expect(raw(truncateFxp(from(-19_999n)))).toBe(-10_000n);
expect(raw(floorFxp(from(-10_001n)))).toBe(-20_000n);
expect(raw(ceilFxp(from(10_001n)))).toBe(20_000n);
expect(raw(roundFxp(from(15_000n)))).toBe(20_000n);
expect(raw(roundFxp(from(-15_000n)))).toBe(-20_000n);
expect(raw(minFxp(from(1n), from(2n)))).toBe(1n);
expect(raw(maxFxp(from(1n), from(2n)))).toBe(2n);
expect(raw(applyFxpRounding(from(-10_001n), true))).toBe(-20_000n);
expect(raw(applyFxpRounding(from(-10_001n), false))).toBe(-10_000n);
```

Assert every zero divisor, including `0 / 0`, throws
`GcsPrimitiveError` with `DIVIDE_BY_ZERO` for both divide and modulo. Include
floor, ceil, round, multiply, and divide vectors within one unit of both
signed-64 boundaries, asserting the pinned saturation outcome.

- [ ] **Step 2: Run the arithmetic test to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  packages/gcs-engine/test/fxp-arithmetic.test.ts
```

Expected: FAIL because arithmetic exports do not exist.

- [ ] **Step 3: Implement exact signed-64 and saturation helpers**

Use these internal rules:

```ts
const wrapSigned64 = (raw: bigint): Fxp => BigInt.asIntN(64, raw) as Fxp;

const saturateSigned64 = (raw: bigint): Fxp =>
  (raw > FXP_MAX_RAW
    ? FXP_MAX_RAW
    : raw < FXP_MIN_RAW
      ? FXP_MIN_RAW
      : raw) as Fxp;

export const addFxp = (left: Fxp, right: Fxp): Fxp =>
  wrapSigned64(left + right);

export const subtractFxp = (left: Fxp, right: Fxp): Fxp =>
  wrapSigned64(left - right);

export const multiplyFxp = (left: Fxp, right: Fxp): Fxp =>
  saturateSigned64((left * right) / FXP_SCALE);
```

Division calculates `(left * FXP_SCALE) / right` and saturates, after an
explicit zero check. Modulo uses raw `left % right` after the same zero check.
Absolute value uses signed-64 wrapping so `abs(MIN)` remains `MIN` like Go.
Truncation uses `(value / FXP_SCALE) * FXP_SCALE`. Implement floor, ceil, and
half-away-from-zero rounding with the pinned saturation checks before adding or
subtracting one scale. `applyFxpRounding(value, true)` calls floor; `false`
calls ceil.

- [ ] **Step 4: Verify GREEN and regression safety**

```sh
docker compose run --rm toolchain pnpm vitest run packages/gcs-engine
docker compose run --rm toolchain pnpm typecheck
```

Expected: all package unit tests and type checks pass.

- [ ] **Step 5: Commit Task 4**

```sh
git add packages/gcs-engine/src/fxp packages/gcs-engine/test/fxp-arithmetic.test.ts
git commit -m "feat: add GCS fixed point arithmetic"
```

### Task 5: TID Validation, Kind Narrowing, and Crypto Generation

**Files:**

- Create: `packages/gcs-engine/src/tid/tid.ts`
- Create: `packages/gcs-engine/src/tid/index.ts`
- Modify: `packages/gcs-engine/src/index.ts`
- Test: `packages/gcs-engine/test/tid.test.ts`
- Create: `tools/gcs-primitives-oracle/internal/oracle/tid.go`
- Test: `tools/gcs-primitives-oracle/internal/oracle/tid_test.go`
- Modify: `tools/gcs-primitives-oracle/internal/oracle/protocol.go`
- Modify: `tools/gcs-primitives-oracle/go.mod`
- Modify: `tools/gcs-primitives-oracle/go.sum`

**Interfaces:**

- Consumes: `GcsPrimitiveError`, Toolbox `tid`, and GCS `model/kinds`.
- Produces: `Tid`, `TidKind`, `TidRandomSource`, `parseTid`, `isTid`,
  `getTidKind`, `assertTidKind`, `generateTid`, and oracle operation
  `tid.inspect` returning `syntaxValid`, `supportedKind`, and `kind`.

- [ ] **Step 1: Write failing TypeScript tests**

Use the deterministic payload `Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11])`
and assert:

```ts
const tid = generateTid("t", () =>
  Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
);
expect(tid).toBe("tAAECAwQFBgcICQoL");
expect(parseTid(tid)).toBe(tid);
expect(getTidKind(tid)).toBe("t");
expect(isTid("TAAECAwQFBgcICQoL")).toBe(true);
expect(isTid("mAAECAwQFBgcICQoL")).toBe(true);
expect(isTid("MAAECAwQFBgcICQoL")).toBe(true);
expect(() => assertTidKind(tid, "T")).toThrowError(
  expect.objectContaining({ code: "INVALID_TID_KIND" }),
);
```

Reject a 16-character ID, an 18-character ID, `+` or `/` payload characters,
an otherwise valid `s` kind with `INVALID_TID_KIND`, and random sources returning
11 or 13 bytes with `CRYPTO_UNAVAILABLE`. Temporarily replace
`globalThis.crypto` through a safely restored property descriptor and assert
missing `getRandomValues` returns `CRYPTO_UNAVAILABLE`; never invoke
`Math.random`.

- [ ] **Step 2: Write failing Go oracle tests**

Assert `tid.inspect` produces:

```json
{ "syntaxValid": true, "supportedKind": true, "kind": "t" }
```

for `tAAECAwQFBgcICQoL`, sets `syntaxValid: true` and
`supportedKind: false` for `sAAECAwQFBgcICQoL`, and reports both false for an
invalid payload. The handler must call `tid.IsValid` and compare the leading
byte to `kinds.Trait`, `kinds.TraitContainer`, `kinds.TraitModifier`, and
`kinds.TraitModifierContainer`.

- [ ] **Step 3: Run both targeted suites to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run packages/gcs-engine/test/tid.test.ts
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle \
  test ./internal/oracle -run TID -v
```

Expected: both fail because TID implementations are absent.

- [ ] **Step 4: Implement the TypeScript TID module**

Use a private brand, exact kinds, and payload expression:

```ts
declare const tidBrand: unique symbol;
export type Tid = string & { readonly [tidBrand]: "Tid" };
export type TidKind = "t" | "T" | "m" | "M";
export type TidRandomSource = () => Uint8Array;

const PAYLOAD = /^[A-Za-z0-9_-]{16}$/;
const KINDS = new Set<string>(["t", "T", "m", "M"]);
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
```

Encode each three-byte group into four `ALPHABET` characters using bit shifts;
12 bytes must yield exactly 16 characters without padding. `parseTid` first
validates 17-character syntax and payload, then distinguishes unsupported kind
from invalid syntax. The default source allocates 12 bytes and fills it with
`globalThis.crypto.getRandomValues`; validate injected output length exactly.

- [ ] **Step 5: Implement `tid.inspect` through pinned Go packages**

Decode `{ "input": string }`, call `tid.IsValid(tid.TID(input))`, capture the
leading kind only when length is non-zero, and compare it to the four pinned GCS
kind constants. Shape errors are process failures; invalid IDs are successful
inspection results, not domain failures.

Because this task imports Toolbox directly, ensure `go mod tidy` records
`github.com/richardwilkes/toolbox/v2 v2.15.0` as a direct requirement rather
than relying only on GCS's transitive graph.

- [ ] **Step 6: Verify GREEN and commit Task 5**

```sh
docker compose run --rm toolchain pnpm vitest run packages/gcs-engine/test/tid.test.ts
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle mod tidy
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle test ./...
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src packages/gcs-engine/test/tid.test.ts \
  tools/gcs-primitives-oracle/internal/oracle
git commit -m "feat: add GCS typed identifiers"
```

Expected: all commands pass and the commit contains no randomness fallback.

### Task 6: Persisted Enum Tables, Strict Parsing, and Visible Normalization

**Files:**

- Create: `packages/gcs-engine/src/enums/normalization.ts`
- Create: `packages/gcs-engine/src/enums/traits.ts`
- Create: `packages/gcs-engine/src/enums/rolls.ts`
- Create: `packages/gcs-engine/src/enums/study.ts`
- Create: `packages/gcs-engine/src/enums/index.ts`
- Modify: `packages/gcs-engine/src/index.ts`
- Test: `packages/gcs-engine/test/enums.test.ts`
- Create: `tools/gcs-primitives-oracle/internal/oracle/enums.go`
- Test: `tools/gcs-primitives-oracle/internal/oracle/enums_test.go`
- Modify: `tools/gcs-primitives-oracle/internal/oracle/protocol.go`

**Interfaces:**

- Consumes: `GcsPrimitiveError` and pinned GCS enum packages.
- Produces: readonly tables and union types `TraitContainerType`,
  `TraitModifierAffects`, `SelfControlRoll`, `SelfControlAdjustment`,
  `FrequencyRoll`, `StudyLevel`, and `StudyType`; specifically named
  `parse...` and `normalize...` functions; `GcsEnumNormalization<T>`; oracle
  operations `enum.table` and `enum.normalize`.

The exact public table names are `TRAIT_CONTAINER_TYPES`,
`TRAIT_MODIFIER_AFFECTS_VALUES`, `SELF_CONTROL_ROLLS`,
`SELF_CONTROL_ADJUSTMENTS`, `FREQUENCY_ROLLS`, `STUDY_LEVELS`, and
`STUDY_TYPES`. The exact parser/normalizer pairs are:

```text
parseTraitContainerType / normalizeTraitContainerType
parseTraitModifierAffects / normalizeTraitModifierAffects
parseSelfControlRoll / normalizeSelfControlRoll
parseSelfControlAdjustment / normalizeSelfControlAdjustment
parseFrequencyRoll / normalizeFrequencyRoll
parseStudyLevel / normalizeStudyLevel
parseStudyType / normalizeStudyType
```

String-domain functions accept `string`; roll-domain functions accept `number`.

- [ ] **Step 1: Write failing exact-table tests**

Assert the exported tables equal these values and ordering:

```ts
expect(TRAIT_CONTAINER_TYPES).toEqual([
  "group",
  "alternative_abilities",
  "ancestry",
  "attributes",
  "meta_trait",
]);
expect(TRAIT_MODIFIER_AFFECTS_VALUES).toEqual([
  "total",
  "base_only",
  "levels_only",
]);
expect(SELF_CONTROL_ROLLS).toEqual([0, 1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
expect(SELF_CONTROL_ADJUSTMENTS).toEqual([
  "none",
  "action_penalty",
  "reaction_penalty",
  "fright_check_penalty",
  "fright_check_bonus",
  "minor_cost_of_living_increase",
  "major_cost_of_living_increase",
]);
expect(FREQUENCY_ROLLS).toEqual([0, 6, 9, 12, 15, 18]);
expect(STUDY_LEVELS).toEqual(["", "180", "160", "140", "120"]);
expect(STUDY_TYPES).toEqual(["self", "job", "teacher", "intensive"]);
```

Assert strict parsers accept only exact canonical values. Assert
`normalizeTraitContainerType("AnCeStRy")` returns `ancestry` without a
diagnostic, `normalizeTraitContainerType("race")` returns `ancestry` with
`LEGACY_ALIAS`, and an unknown value returns `group` with `FALLBACK_DEFAULT`.
For every other string enum, case-insensitive canonical input has no diagnostic
and unknown input falls back to the first table value with
`FALLBACK_DEFAULT`. Unknown numeric rolls fall back to `0` with the same
diagnostic. Wrong strict inputs throw `INVALID_ENUM`.

- [ ] **Step 2: Write failing Go enum tests**

Call `enum.table` for these exact domain names:

```text
trait_container
trait_modifier_affects
self_control_roll
self_control_adjustment
frequency_roll
study_level
study_type
```

Assert returned canonical arrays match the TypeScript table above. Call
`enum.normalize` for canonical mixed-case strings, `race`, unknown strings, and
unknown numeric rolls; assert the pinned GCS normalized value. The oracle need
not emit TypeScript diagnostics because those describe the safer TypeScript API,
not upstream state.

- [ ] **Step 3: Run targeted tests to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run packages/gcs-engine/test/enums.test.ts
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle \
  test ./internal/oracle -run Enum -v
```

Expected: both fail because enum exports and operations are absent.

- [ ] **Step 4: Implement shared normalization without a public registry**

Use this result contract:

```ts
export type GcsEnumDiagnosticCode = "LEGACY_ALIAS" | "FALLBACK_DEFAULT";

export type GcsEnumNormalization<T extends string | number> = {
  value: T;
  diagnostic?: {
    code: GcsEnumDiagnosticCode;
    input: string | number;
    canonical: T;
  };
};
```

Keep generic lookup helpers module-private. Each domain exposes explicit parser
and normalizer names. Strict string parsing uses exact `includes`; compatibility
normalization uses case-insensitive canonical matching. Only container type maps
`race` to `ancestry` with `LEGACY_ALIAS`. Defaults are the first values in the
approved tables. Freeze behavior through readonly `as const` arrays; do not add
localized labels or multiplier calculations.

- [ ] **Step 5: Implement enum oracle operations using GCS APIs**

Construct tables from pinned constants and `.Key()` methods. Normalize strings
with `container.ExtractType`, `affects.ExtractOption`,
`selfctrl.ExtractAdjustment`, `study.ExtractLevel`, and `study.ExtractType`.
Normalize numbers through `selfctrl.Roll(value).EnsureValid()` and
`frequency.Roll(value).EnsureValid()`. Do not hardcode a different fallback in
the oracle.

- [ ] **Step 6: Verify GREEN and commit Task 6**

```sh
docker compose run --rm toolchain pnpm vitest run packages/gcs-engine/test/enums.test.ts
docker compose run --rm toolchain go -C tools/gcs-primitives-oracle test ./...
docker compose run --rm toolchain pnpm typecheck
git add packages/gcs-engine/src packages/gcs-engine/test/enums.test.ts \
  tools/gcs-primitives-oracle/internal/oracle
git commit -m "feat: add persisted GCS enum primitives"
```

Expected: complete selected tables, diagnostics, and pinned oracle behavior pass.

### Task 7: Differential Primitive Conformance

**Files:**

- Create: `tests/primitives/oracle-protocol.ts`
- Create: `tests/primitives/oracle-runner.ts`
- Test: `tests/primitives/oracle-runner.test.ts`
- Create: `tests/primitives/vectors.ts`
- Test: `tests/primitives/fxp-conformance.test.ts`
- Test: `tests/primitives/tid-conformance.test.ts`
- Test: `tests/primitives/enum-conformance.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: all Tasks 1–6 public exports and JSONL operations.
- Produces: `test:primitives-conformance` and deterministic differential proof
  that TypeScript results match the pinned Go oracle.

- [ ] **Step 1: Write failing protocol/runner tests**

Define discriminated response types and validate every field. The runner sends
an entire request array to one process using newline-delimited JSON, rejects a
non-zero process status including stderr, rejects invalid JSON, rejects duplicate
or missing IDs, and restores response order by request ID. Test it with a small
Node fixture process for success, invalid response, duplicate ID, and exit code
7 with stderr `oracle exploded`.

Use this process contract:

```ts
export type PrimitiveOracleRequest = {
  id: string;
  op: string;
  args: Record<string, unknown>;
};

export type PrimitiveOracleResponse =
  | { id: string; ok: true; result: Record<string, unknown> }
  | { id: string; ok: false; category: string; message: string };

export function runPrimitiveOracle(
  requests: readonly PrimitiveOracleRequest[],
): readonly PrimitiveOracleResponse[];
```

Default execution is `go -C tools/gcs-primitives-oracle run
./cmd/gcs-primitives-oracle`; tests inject a command and arguments.

- [ ] **Step 2: Run the runner test to verify RED**

```sh
docker compose run --rm toolchain pnpm vitest run \
  tests/primitives/oracle-runner.test.ts
```

Expected: FAIL because the runner is absent.

- [ ] **Step 3: Implement the batch JSONL runner**

Use `spawnSync` with UTF-8 input, finite timeout, and a finite `maxBuffer`.
Construct input as `requests.map(JSON.stringify).join("\n") + "\n"`. Treat
spawn errors, signals, non-zero status, stderr on failure, response-count
mismatch, duplicate IDs, unknown IDs, and response-shape errors as test failures.
Do not accept partial success.

- [ ] **Step 4: Add deterministic fixed-point vectors before comparison code**

Implement a repository-owned 64-bit linear congruential generator using:

```ts
state = BigInt.asUintN(64, state * 6364136223846793005n + 1442695040888963407n);
```

Record seed `0x4743535f465850n`. Generate at least 256 left/right raw pairs,
replace zero divisors with `1n`, and include explicit parsing, min/max,
wraparound, saturation, negative-zero-adjacent, and rounding-boundary vectors.
On mismatch include operation, seed, vector index, operands, TypeScript raw, and
Go raw in the assertion message.

- [ ] **Step 5: Write and run fixed-point conformance**

Batch the exact corresponding oracle requests, calculate the TypeScript result
through public package exports, and compare raw decimal strings. Include all
operations, not only random binary arithmetic.

```sh
docker compose run --rm toolchain pnpm vitest run \
  tests/primitives/fxp-conformance.test.ts
```

Expected: PASS. Any mismatch must be debugged against pinned source with
`superpowers:systematic-debugging`; do not change expected results merely to
match TypeScript.

- [ ] **Step 6: Write TID and enum conformance**

Generate one TID for each allowed kind from the deterministic 12-byte payload
and verify `tid.inspect` reports valid syntax, supported kind, and exact kind.
Send invalid length, payload, and unsupported-kind IDs and compare TypeScript
classification.

For enums, compare all seven exported tables to `enum.table`, then send every
canonical value, every uppercase string form, `race`, one unknown string per
domain, and unknown numeric rolls `2`, `5`, `16`, and `255` to
`enum.normalize`. Compare normalized values and separately assert TypeScript
diagnostics.

- [ ] **Step 7: Add the root script and run the complete conformance surface**

Add:

```json
"test:primitives-conformance": "vitest run tests/primitives"
```

Run:

```sh
docker compose run --rm toolchain pnpm test:primitives-oracle
docker compose run --rm toolchain pnpm test:primitives-conformance
docker compose run --rm toolchain pnpm test:conformance
```

Expected: primitive Go tests, primitive differential tests, and existing
document conformance all pass.

- [ ] **Step 8: Commit Task 7**

```sh
git add package.json tests/primitives
git commit -m "test: prove TypeScript primitive conformance"
```

### Task 8: Package Surface, Documentation, Licensing, and Canonical Gate

**Files:**

- Modify: `tests/package-smoke.mjs`
- Modify: `packages/gcs-engine/README.md`
- Modify: `README.md`
- Modify: `THIRD_PARTY_NOTICES.md`
- Modify: `package.json`
- Modify if required by build evidence: `docker/toolchain.Dockerfile`
- Do not modify automatically: `packages/gcs-engine/AGENTS.md`

**Interfaces:**

- Consumes: complete primitive implementation and tests.
- Produces: documented built-package exports, complete Docker-first root gate,
  and final implementation evidence.

- [ ] **Step 1: Add built-package smoke assertions for the completed behavior**

Extend `tests/package-smoke.mjs` to import and assert representative public
behavior from `packages/gcs-engine/dist/index.js`:

```js
const fixed = parseFxp("1.25");
assert.equal(fxpToRaw(fixed), 12_500n);
assert.equal(formatFxp(multiplyFxp(fixed, parseFxp("2"))), "2.5");
assert.equal(generateTid("t", () => new Uint8Array(12)).length, 17);
assert.equal(parseTraitContainerType("ancestry"), "ancestry");
assert.equal(
  normalizeTraitContainerType("race").diagnostic?.code,
  "LEGACY_ALIAS",
);
```

Also assert `GcsPrimitiveError` is exported and the existing parse/serialize
smoke assertions remain unchanged.

- [ ] **Step 2: Rebuild and verify the package smoke test**

```sh
docker compose run --rm toolchain pnpm build
docker compose run --rm toolchain pnpm test:package
```

Expected: PASS because Tasks 3–6 already established the behavior through RED
and GREEN unit tests. If it fails, fix only the missing export barrel, generated
declaration, or package-surface defect through the relevant targeted test.

- [ ] **Step 3: Document the supported primitive API and upstream boundary**

In package documentation, include fixed-point scale/range, truncation and
rounding behavior, divide-by-zero errors, four TID kinds, cryptographic source,
strict versus compatibility enum APIs, diagnostic codes, and a short example.
In the root README, state that the primitives slice is available while typed
traits and calculations remain future work.

Extend `THIRD_PARTY_NOTICES.md` with exact pinned source repositories, tags,
paths used for translated behavior, and MPL-2.0 notice. Do not claim that the
entire monorepo is MPL-2.0.

- [ ] **Step 4: Wire every new test into the canonical gate**

Update `check` in this order:

```json
"check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:unit && pnpm test:oracle && pnpm test:primitives-oracle && pnpm test:conformance && pnpm test:primitives-conformance && pnpm build && pnpm test:package && pnpm deps:check && pnpm audit:prod"
```

CI already invokes `pnpm check` in Docker; modify `.github/workflows/ci.yml`
only if inspection proves it does not use that command.

- [ ] **Step 5: Run focused quality checks and inspect maintained file sizes**

```sh
docker compose run --rm toolchain pnpm format
docker compose run --rm toolchain pnpm lint
docker compose run --rm toolchain pnpm typecheck
find packages/gcs-engine/src tools/gcs-primitives-oracle tests/primitives \
  -type f \( -name '*.ts' -o -name '*.go' \) -print0 | \
  xargs -0 wc -l | sort -nr | head -20
git diff --check
```

Expected: format, lint, and typecheck pass; no manually maintained source file
exceeds 500 lines. Split a file by coherent responsibility before proceeding if
it does.

- [ ] **Step 6: Run the complete canonical gate with fresh evidence**

First invoke `superpowers:verification-before-completion`, then run:

```sh
docker compose build toolchain
docker compose run --rm toolchain pnpm install --frozen-lockfile
docker compose run --rm toolchain pnpm check
git status --short --branch
git diff --check
```

Expected: image build succeeds; lockfile install is reproducible; formatting,
lint, typecheck, all TypeScript tests, both Go oracle suites, both conformance
suites, build, package smoke, dependency tree, and audit pass; status contains
only the intended task changes.

- [ ] **Step 7: Review the complete diff and licensing boundary**

```sh
git diff "$(git merge-base main HEAD)" --stat
git diff "$(git merge-base main HEAD)" -- \
  ':!pnpm-lock.yaml' ':!fixtures/gcs-v5/*.gcs'
docker compose run --rm toolchain pnpm --filter @gcs/gcs-engine \
  list --prod --depth Infinity
```

Confirm no fixture changed, no production dependency exists, no host path or
secret was added, and the existing parser/serializer contract is untouched.

- [ ] **Step 8: Prepare the nested AGENTS.md candidate without editing it**

Include this exact candidate in the implementation report for user approval:

```markdown
- `Fxp` stores signed 64-bit raw values at scale 10,000; parsing and arithmetic
  must remain differentially conformant with GCS v5.44.0.
- Production TID generation accepts only `t`, `T`, `m`, and `M`, uses 12
  cryptographically random bytes, and must never fall back to `Math.random`.
- Persisted enum imports provide a strict parser and a compatibility normalizer;
  legacy aliases and fallback defaults must return visible diagnostics.
```

Do not edit `packages/gcs-engine/AGENTS.md` unless the user explicitly approves
that candidate.

- [ ] **Step 9: Request Superpowers code review and resolve findings**

Invoke `superpowers:requesting-code-review`. The reviewer must check design and
plan compliance, public API stability, signed-boundary arithmetic, oracle
independence, no silent enum fallback, randomness, licensing, and the complete
gate evidence. Apply accepted findings through TDD and rerun the affected checks
plus the complete canonical gate.

- [ ] **Step 10: Commit final integration**

```sh
git add README.md THIRD_PARTY_NOTICES.md package.json \
  packages/gcs-engine/README.md tests/package-smoke.mjs \
  docker/toolchain.Dockerfile .github/workflows/ci.yml
git commit -m "chore: integrate GCS primitive conformance gate"
```

Stage only files that actually changed; omit `.github/workflows/ci.yml` when the
existing workflow already delegates to `pnpm check`.

## Completion Report Requirements

The implementing agent must report:

- task-by-task commits and subagent review checkpoints;
- observed RED and GREEN commands for every task;
- exact final Docker gate output summary;
- dependency-tree and audit result;
- whether the optional extended corpus was run, without treating its absence as
  a skipped canonical check;
- all deviations, tool failures, and approved workarounds;
- the exact `AGENTS.md` candidate above;
- confirmation that no `/GCS` path, production Go dependency, runtime package,
  weakened check, changed fixture, or parser/serializer behavior was introduced;
- the sentence `No silent workaround was used` only when factually true.
