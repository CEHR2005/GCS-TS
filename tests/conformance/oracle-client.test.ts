import { execPath } from "node:process";

import { describe, expect, it } from "vitest";

import { GcsOracleClient } from "./oracle-client";

const validDocument = JSON.stringify({ version: 5 });

function nodeOracle(source: string): GcsOracleClient {
  return new GcsOracleClient({ command: execPath, args: ["-e", source] });
}

function responseOracle(response: unknown): GcsOracleClient {
  const line = `${JSON.stringify(response)}\n`;
  return nodeOracle(`
    process.stdin.once("data", () => {
      process.stdout.write(${JSON.stringify(line)});
      process.stdin.unref();
    });
  `);
}

describe("GcsOracleClient protocol validation", () => {
  it.each([null, [], "not-an-object"])(
    "rejects a success response with document %j",
    async (document) => {
      const oracle = responseOracle({ id: "case", ok: true, document });
      try {
        await expect(oracle.normalize("case", validDocument)).rejects.toThrow(
          "success case has an invalid document",
        );
      } finally {
        await oracle.close().catch(() => undefined);
      }
    },
  );

  it("rejects an unknown failure category", async () => {
    const oracle = responseOracle({
      id: "case",
      ok: false,
      category: "surprise",
      message: "unknown category",
    });
    try {
      await expect(oracle.normalize("case", validDocument)).rejects.toThrow(
        "failure case has an invalid category",
      );
    } finally {
      await oracle.close().catch(() => undefined);
    }
  });

  it("rejects an unknown response id", async () => {
    const oracle = nodeOracle(`
      process.stdin.once("data", () => {
        process.stdout.write('{"id":"unknown","ok":true,"document":{}}\\n');
      });
    `);

    await expect(oracle.normalize("expected", validDocument)).rejects.toThrow(
      "unknown response id",
    );
    await expect(oracle.close()).rejects.toThrow("unknown response id");
  });

  it("rejects a duplicate response id", async () => {
    const oracle = nodeOracle(`
      process.stdin.once("data", () => {
        const response = '{"id":"case","ok":true,"document":{}}\\n';
        process.stdout.write(response + response);
      });
    `);

    await expect(
      oracle.normalize("case", validDocument),
    ).resolves.toMatchObject({
      id: "case",
      ok: true,
    });
    await expect(oracle.close()).rejects.toThrow("duplicate response id");
  });

  it("rejects missing responses when the oracle exits cleanly", async () => {
    const oracle = nodeOracle(`process.stdin.resume()`);
    const response = oracle.normalize("missing", validDocument);
    const close = oracle.close();

    await expect(response).rejects.toThrow("missing response ids: missing");
    await expect(close).rejects.toThrow("missing response ids: missing");
  });

  it("reports a non-zero exit with stderr", async () => {
    const oracle = nodeOracle(`
      process.stdin.once("data", () => {
        process.stderr.write("oracle exploded");
        process.exit(7);
      });
    `);

    const response = oracle.normalize("case", validDocument);
    await expect(response).rejects.toThrow(/exit code 7.*oracle exploded/s);
    await expect(oracle.close()).rejects.toThrow(
      /exit code 7.*oracle exploded/s,
    );
  });
});
