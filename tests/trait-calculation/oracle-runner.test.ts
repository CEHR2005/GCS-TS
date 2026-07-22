import { execPath } from "node:process";
import { describe, expect, it } from "vitest";
import {
  runTraitCalculationOracle,
  type TraitCalculationOracleRunnerOptions,
} from "./oracle-runner";
import type { TraitCalculationOracleRequest } from "./oracle-protocol";

const requests: readonly TraitCalculationOracleRequest[] = [false, true].map(
  (mode, index) => ({
    id: `request-${index}`,
    op: "traits.calculate",
    document: '{"version":5,"traits":[]}',
    use_multiplicative_modifiers: mode,
  }),
);
const success = (id: string) =>
  JSON.stringify({ id, ok: true, result: { traits: [] } });
const nodeFixture = (source: string): TraitCalculationOracleRunnerOptions => ({
  command: execPath,
  args: ["-e", source],
});
const staticFixture = (lines: readonly string[]) =>
  nodeFixture(
    `process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(${JSON.stringify(`${lines.join("\n")}\n`)}));`,
  );

describe("runTraitCalculationOracle", () => {
  it("sends exact newline-delimited requests and restores response order", () => {
    expect(
      runTraitCalculationOracle(
        requests,
        nodeFixture(
          `let input="";process.stdin.setEncoding("utf8");process.stdin.on("data",c=>input+=c);process.stdin.on("end",()=>{if(!input.endsWith("\\n"))process.exit(2);const values=input.trimEnd().split("\\n").map(JSON.parse);for(const value of values){if(Object.keys(value).sort().join()!=="document,id,op,use_multiplicative_modifiers"||value.op!=="traits.calculate")process.exit(3)}for(const value of values.reverse())process.stdout.write(JSON.stringify({id:value.id,ok:true,result:{traits:[]}})+"\\n")})`,
        ),
      ),
    ).toEqual([
      { id: "request-0", ok: true, result: { traits: [] } },
      { id: "request-1", ok: true, result: { traits: [] } },
    ]);
  });
  it("returns immediately for an empty batch", () =>
    expect(runTraitCalculationOracle([], { command: "must-not-run" })).toEqual(
      [],
    ));
  it.each([
    null,
    [],
    { ok: true, result: {} },
    { id: 1, ok: true, result: {} },
    { id: "request-0", result: {} },
    { id: "request-0", ok: false, result: {} },
    { id: "request-0", ok: true, result: null },
    { id: "request-0", ok: true, result: {}, extra: true },
  ])("rejects invalid response shape %#", (response) =>
    expect(() =>
      runTraitCalculationOracle(
        requests.slice(0, 1),
        staticFixture([JSON.stringify(response)]),
      ),
    ).toThrow(/invalid trait calculation oracle response/i),
  );
  it("rejects invalid JSON", () =>
    expect(() =>
      runTraitCalculationOracle(requests.slice(0, 1), staticFixture(["bad"])),
    ).toThrow(/response JSON/i));
  it("requires a terminal newline", () =>
    expect(() =>
      runTraitCalculationOracle(
        requests.slice(0, 1),
        nodeFixture(
          `process.stdin.resume();process.stdin.on("end",()=>process.stdout.write(${JSON.stringify(success("request-0"))}))`,
        ),
      ),
    ).toThrow(/terminal newline/i));
  it.each([
    [[success("request-0"), "", success("request-1")]],
    [[success("request-0"), success("request-1"), ""]],
  ])("rejects blank records", (lines) =>
    expect(() =>
      runTraitCalculationOracle(requests, staticFixture(lines)),
    ).toThrow(/blank trait calculation/i),
  );
  it("rejects unknown IDs", () =>
    expect(() =>
      runTraitCalculationOracle(
        requests.slice(0, 1),
        staticFixture([success("other")]),
      ),
    ).toThrow(/unknown response id/i));
  it("rejects duplicate IDs", () =>
    expect(() =>
      runTraitCalculationOracle(
        requests,
        staticFixture([success("request-0"), success("request-0")]),
      ),
    ).toThrow(/duplicate response id/i));
  it("reports missing IDs and count", () =>
    expect(() =>
      runTraitCalculationOracle(
        requests,
        staticFixture([success("request-0")]),
      ),
    ).toThrow(/missing response ids.*response-count mismatch/s));
  it("reports a signal", () =>
    expect(() =>
      runTraitCalculationOracle(
        requests.slice(0, 1),
        nodeFixture(
          `process.stdin.resume();process.stdin.on("end",()=>process.kill(process.pid,"SIGTERM"))`,
        ),
      ),
    ).toThrow(/signal SIGTERM/i));
  it("reports timeout", () =>
    expect(() =>
      runTraitCalculationOracle(requests.slice(0, 1), {
        ...nodeFixture(
          `process.stdin.resume();process.stdin.on("end",()=>setInterval(()=>{},1000))`,
        ),
        timeoutMs: 20,
      }),
    ).toThrow(/timed out after 20 ms/i));
  it.each(["stdout", "stderr"] as const)(
    "reports %s buffer overflow",
    (stream) =>
      expect(() =>
        runTraitCalculationOracle(requests.slice(0, 1), {
          ...nodeFixture(
            `process.stdin.resume();process.stdin.on("end",()=>process.${stream}.write("x".repeat(1024)))`,
          ),
          maxBuffer: 64,
        }),
      ).toThrow(/exceeded its 64-byte output buffer/i),
  );
  it("reports spawn failures", () =>
    expect(() =>
      runTraitCalculationOracle(requests.slice(0, 1), {
        command: "not-a-command",
      }),
    ).toThrow(/start trait calculation oracle/i));
  it("reports nonzero status and stderr", () =>
    expect(() =>
      runTraitCalculationOracle(
        requests.slice(0, 1),
        nodeFixture(
          `process.stdin.resume();process.stdin.on("end",()=>{process.stderr.write("boom");process.exit(7)})`,
        ),
      ),
    ).toThrow(/exit code 7.*boom/s));
  it.each([
    {
      id: 1,
      op: "traits.calculate",
      document: "{}",
      use_multiplicative_modifiers: false,
    },
    {
      id: "x",
      op: "traits.project",
      document: "{}",
      use_multiplicative_modifiers: false,
    },
    {
      id: "x",
      op: "traits.calculate",
      document: {},
      use_multiplicative_modifiers: false,
    },
    {
      id: "x",
      op: "traits.calculate",
      document: "{}",
      use_multiplicative_modifiers: "no",
    },
    {
      id: "x",
      op: "traits.calculate",
      document: "{}",
      use_multiplicative_modifiers: false,
      extra: true,
    },
  ])("rejects invalid request %#", (request) =>
    expect(() =>
      runTraitCalculationOracle([
        request as unknown as TraitCalculationOracleRequest,
      ]),
    ).toThrow(/invalid trait calculation oracle request/i),
  );
  it("rejects duplicate request IDs", () =>
    expect(() =>
      runTraitCalculationOracle([requests[0]!, requests[0]!]),
    ).toThrow(/duplicate request id/i));
});
