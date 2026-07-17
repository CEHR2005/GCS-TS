import { execPath } from "node:process";

import { describe, expect, it } from "vitest";

import {
  runPrimitiveOracle,
  type PrimitiveOracleRunnerOptions,
} from "./oracle-runner";
import type { PrimitiveOracleRequest } from "./oracle-protocol";

const requests: readonly PrimitiveOracleRequest[] = [
  { id: "first", op: "meta.ping", args: {} },
  { id: "second", op: "meta.ping", args: {} },
];

function nodeFixture(source: string): PrimitiveOracleRunnerOptions {
  return { command: execPath, args: ["-e", source] };
}

function staticFixture(lines: readonly string[]): PrimitiveOracleRunnerOptions {
  return nodeFixture(`
    process.stdin.resume();
    process.stdin.on("end", () => {
      process.stdout.write(${JSON.stringify(`${lines.join("\n")}\n`)});
    });
  `);
}

describe("runPrimitiveOracle", () => {
  it("restores request order when valid responses arrive out of order", () => {
    const responses = runPrimitiveOracle(
      requests,
      staticFixture([
        JSON.stringify({
          id: "second",
          ok: false,
          category: "invalid_fxp",
          message: "invalid",
        }),
        JSON.stringify({ id: "first", ok: true, result: { raw: "1" } }),
      ]),
    );

    expect(responses).toEqual([
      { id: "first", ok: true, result: { raw: "1" } },
      {
        id: "second",
        ok: false,
        category: "invalid_fxp",
        message: "invalid",
      },
    ]);
  });

  it("rejects invalid response JSON", () => {
    expect(() =>
      runPrimitiveOracle(requests.slice(0, 1), staticFixture(["not-json"])),
    ).toThrow(/invalid primitive oracle response JSON/i);
  });

  it.each([
    { id: "first", ok: true, result: null },
    { id: "first", ok: true, result: {}, category: "unexpected" },
    { id: "first", ok: false, category: "invalid_fxp" },
    {
      id: "first",
      ok: false,
      category: "invalid_fxp",
      message: "invalid",
      result: {},
    },
    { id: "first", ok: "yes", result: {} },
  ])("rejects invalid response shape %#", (response) => {
    expect(() =>
      runPrimitiveOracle(
        requests.slice(0, 1),
        staticFixture([JSON.stringify(response)]),
      ),
    ).toThrow(/invalid primitive oracle response/i);
  });

  it("rejects duplicate response IDs", () => {
    const response = JSON.stringify({
      id: "first",
      ok: true,
      result: {},
    });
    expect(() =>
      runPrimitiveOracle(requests, staticFixture([response, response])),
    ).toThrow(/duplicate response id: first/i);
  });

  it.each([
    [
      "an internal blank record",
      [
        JSON.stringify({ id: "first", ok: true, result: {} }),
        "",
        JSON.stringify({ id: "second", ok: true, result: {} }),
      ],
    ],
    [
      "duplicate trailing newlines",
      [
        JSON.stringify({ id: "first", ok: true, result: {} }),
        JSON.stringify({ id: "second", ok: true, result: {} }),
        "",
      ],
    ],
  ] as const)("rejects %s", (_label, lines) => {
    expect(() => runPrimitiveOracle(requests, staticFixture(lines))).toThrow(
      /blank primitive oracle response record/i,
    );
  });

  it("rejects missing response IDs", () => {
    expect(() =>
      runPrimitiveOracle(
        requests,
        staticFixture([JSON.stringify({ id: "first", ok: true, result: {} })]),
      ),
    ).toThrow(/missing response ids: second/i);
  });

  it("rejects unknown response IDs", () => {
    expect(() =>
      runPrimitiveOracle(
        requests.slice(0, 1),
        staticFixture([
          JSON.stringify({ id: "unknown", ok: true, result: {} }),
        ]),
      ),
    ).toThrow(/unknown response id: unknown/i);
  });

  it("reports a non-zero exit status and stderr", () => {
    expect(() =>
      runPrimitiveOracle(
        requests.slice(0, 1),
        nodeFixture(`
          process.stdin.resume();
          process.stdin.on("end", () => {
            process.stderr.write("oracle exploded");
            process.exit(7);
          });
        `),
      ),
    ).toThrow(/exit code 7.*oracle exploded/s);
  });
});
