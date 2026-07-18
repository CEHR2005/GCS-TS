import { execPath } from "node:process";

import { describe, expect, it } from "vitest";

import {
  runTraitsOracle,
  type TraitsOracleRunnerOptions,
} from "./oracle-runner";
import type { TraitsOracleRequest } from "./oracle-protocol";

const requests: readonly TraitsOracleRequest[] = [
  {
    id: "first",
    op: "traits.project",
    document: '{"version":5,"traits":[]}',
  },
  {
    id: "second",
    op: "traits.project",
    document: '{"version":5,"traits":[{"id":"tAAECAwQFBgcICQoL"}]}',
  },
];

function nodeFixture(source: string): TraitsOracleRunnerOptions {
  return { command: execPath, args: ["-e", source] };
}

function staticFixture(lines: readonly string[]): TraitsOracleRunnerOptions {
  return nodeFixture(`
    process.stdin.resume();
    process.stdin.on("end", () => {
      process.stdout.write(${JSON.stringify(`${lines.join("\n")}\n`)});
    });
  `);
}

function success(id: string): string {
  return JSON.stringify({ id, ok: true, result: { traits: [] } });
}

describe("runTraitsOracle", () => {
  it("sends one terminal-newline-delimited request per document and restores request order", () => {
    const responses = runTraitsOracle(
      requests,
      nodeFixture(`
        let input = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { input += chunk; });
        process.stdin.on("end", () => {
          if (!input.endsWith("\\n")) {
            process.stderr.write("missing terminal request newline");
            process.exit(2);
          }
          const lines = input.slice(0, -1).split("\\n");
          if (lines.length !== 2 || lines.some((line) => line.length === 0)) {
            process.stderr.write("invalid request records");
            process.exit(3);
          }
          const decoded = lines.map(JSON.parse);
          if (decoded[0].document !== ${JSON.stringify(requests[0]!.document)} ||
              decoded[1].document !== ${JSON.stringify(requests[1]!.document)}) {
            process.stderr.write("documents changed");
            process.exit(4);
          }
          for (const request of decoded.reverse()) {
            process.stdout.write(JSON.stringify({
              id: request.id,
              ok: true,
              result: { traits: [{ id: request.id }] },
            }) + "\\n");
          }
        });
      `),
    );

    expect(responses).toEqual([
      { id: "first", ok: true, result: { traits: [{ id: "first" }] } },
      { id: "second", ok: true, result: { traits: [{ id: "second" }] } },
    ]);
  });

  it("returns immediately for an empty batch", () => {
    expect(
      runTraitsOracle([], { command: "command-that-must-not-be-spawned" }),
    ).toEqual([]);
  });

  it.each([
    ["a non-object", null],
    ["an array", []],
    ["a missing id", { ok: true, result: {} }],
    ["a non-string id", { id: 1, ok: true, result: {} }],
    ["a missing ok", { id: "first", result: {} }],
    ["a non-boolean ok", { id: "first", ok: "yes", result: {} }],
    ["a non-object result", { id: "first", ok: true, result: null }],
    [
      "extra success fields",
      { id: "first", ok: true, result: {}, category: "unexpected" },
    ],
    [
      "a missing failure category",
      { id: "first", ok: false, message: "failed" },
    ],
    [
      "a non-string failure category",
      { id: "first", ok: false, category: 1, message: "failed" },
    ],
    [
      "a missing failure message",
      { id: "first", ok: false, category: "invalid_document" },
    ],
    [
      "a non-string failure message",
      {
        id: "first",
        ok: false,
        category: "invalid_document",
        message: 1,
      },
    ],
    [
      "extra failure fields",
      {
        id: "first",
        ok: false,
        category: "invalid_document",
        message: "failed",
        result: {},
      },
    ],
  ])("rejects invalid response shape: %s", (_label, response) => {
    expect(() =>
      runTraitsOracle(
        requests.slice(0, 1),
        staticFixture([JSON.stringify(response)]),
      ),
    ).toThrow(/invalid traits oracle response/i);
  });

  it("accepts the strict failure response shape", () => {
    expect(
      runTraitsOracle(
        requests.slice(0, 1),
        staticFixture([
          JSON.stringify({
            id: "first",
            ok: false,
            category: "invalid_document",
            message: "invalid document",
          }),
        ]),
      ),
    ).toEqual([
      {
        id: "first",
        ok: false,
        category: "invalid_document",
        message: "invalid document",
      },
    ]);
  });

  it("rejects invalid response JSON", () => {
    expect(() =>
      runTraitsOracle(requests.slice(0, 1), staticFixture(["not-json"])),
    ).toThrow(/invalid traits oracle response JSON/i);
  });

  it("requires a terminal response newline", () => {
    expect(() =>
      runTraitsOracle(
        requests.slice(0, 1),
        nodeFixture(`
          process.stdin.resume();
          process.stdin.on("end", () => process.stdout.write(${JSON.stringify(success("first"))}));
        `),
      ),
    ).toThrow(/missing its terminal newline/i);
  });

  it.each([
    ["an internal blank record", [success("first"), "", success("second")]],
    ["duplicate trailing newlines", [success("first"), success("second"), ""]],
  ] as const)("rejects %s", (_label, lines) => {
    expect(() => runTraitsOracle(requests, staticFixture(lines))).toThrow(
      /blank traits oracle response record/i,
    );
  });

  it("rejects duplicate response IDs", () => {
    expect(() =>
      runTraitsOracle(
        requests,
        staticFixture([success("first"), success("first")]),
      ),
    ).toThrow(/duplicate response id: first/i);
  });

  it("rejects unknown response IDs", () => {
    expect(() =>
      runTraitsOracle(requests.slice(0, 1), staticFixture([success("other")])),
    ).toThrow(/unknown response id: other/i);
  });

  it("reports missing IDs and a response-count mismatch", () => {
    expect(() =>
      runTraitsOracle(requests, staticFixture([success("first")])),
    ).toThrow(/missing response ids: second.*response-count mismatch/s);
  });

  it("rejects a process signal", () => {
    expect(() =>
      runTraitsOracle(
        requests.slice(0, 1),
        nodeFixture(`
          process.stdin.resume();
          process.stdin.on("end", () => process.kill(process.pid, "SIGTERM"));
        `),
      ),
    ).toThrow(/failed with signal SIGTERM/i);
  });

  it("rejects a timeout distinctly", () => {
    expect(() =>
      runTraitsOracle(requests.slice(0, 1), {
        ...nodeFixture(`
            process.stdin.resume();
            process.stdin.on("end", () => setInterval(() => {}, 1_000));
          `),
        timeoutMs: 20,
      }),
    ).toThrow(/timed out after 20 ms/i);
  });

  it.each(["stdout", "stderr"] as const)(
    "reports %s max-buffer overflow distinctly",
    (stream) => {
      expect(() =>
        runTraitsOracle(requests.slice(0, 1), {
          ...nodeFixture(`
            process.stdin.resume();
            process.stdin.on("end", () => {
              process.${stream}.write("x".repeat(1_024));
            });
          `),
          maxBuffer: 64,
        }),
      ).toThrow(/traits oracle process exceeded its 64-byte output buffer/i);
    },
  );

  it("rejects a spawn error", () => {
    expect(() =>
      runTraitsOracle(requests.slice(0, 1), {
        command: "definitely-not-a-real-gcs-traits-oracle-command",
      }),
    ).toThrow(/start traits oracle/i);
  });

  it("reports a non-zero status with stderr", () => {
    expect(() =>
      runTraitsOracle(
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

  it.each([
    ["a non-string id", { id: 1, op: "traits.project", document: "{}" }],
    ["a non-string op", { id: "id", op: 1, document: "{}" }],
    ["a non-string document", { id: "id", op: "traits.project", document: {} }],
    [
      "an extra field",
      { id: "id", op: "traits.project", document: "{}", extra: true },
    ],
  ])("rejects invalid requests: %s", (_label, request) => {
    expect(() =>
      runTraitsOracle([request as unknown as TraitsOracleRequest]),
    ).toThrow(/invalid traits oracle request/i);
  });

  it("rejects duplicate request IDs", () => {
    expect(() => runTraitsOracle([requests[0]!, requests[0]!])).toThrow(
      /duplicate request id: first/i,
    );
  });
});
