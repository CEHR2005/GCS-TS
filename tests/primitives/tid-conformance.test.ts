import {
  GcsPrimitiveError,
  generateTid,
  parseTid,
  type TidKind,
} from "@gcs/gcs-engine";
import { describe, expect, it } from "vitest";

import type { PrimitiveOracleResponse } from "./oracle-protocol";
import { runPrimitiveOracle } from "./oracle-runner";

const payloadBytes = Uint8Array.from({ length: 12 }, (_, index) => index);
const expectedPayload = "AAECAwQFBgcICQoL";

describe("TID conformance with Toolbox v2.15.0", () => {
  it("generates all four kinds with a deterministic 96-bit payload", () => {
    const kinds = ["t", "T", "m", "M"] as const;
    const identifiers = kinds.map((kind) =>
      generateTid(kind, () => payloadBytes),
    );
    expect(identifiers).toEqual(
      kinds.map((kind) => `${kind}${expectedPayload}`),
    );

    const responses = inspect(identifiers);
    responses.forEach((response, index) => {
      expect(response.result).toEqual({
        syntaxValid: true,
        supportedKind: true,
        kind: kinds[index],
      });
    });
  }, 30_000);

  it("matches invalid length, payload, and unsupported-kind classification", () => {
    const inputs = [
      "tshort",
      "tAAAAAAAAAAAAAAA+",
      `s${expectedPayload}`,
    ] as const;
    const goResults = inspect(inputs).map(({ result }) => result);
    const tsResults = inputs.map(classifyWithTypescript);

    expect(tsResults).toEqual(goResults);
    expect(goResults).toEqual([
      { syntaxValid: false, supportedKind: false, kind: "t" },
      { syntaxValid: false, supportedKind: false, kind: "t" },
      { syntaxValid: true, supportedKind: false, kind: "s" },
    ]);
  }, 30_000);
});

function inspect(
  inputs: readonly string[],
): readonly Extract<PrimitiveOracleResponse, { ok: true }>[] {
  return runPrimitiveOracle(
    inputs.map((input, index) => ({
      id: `tid-${index}`,
      op: "tid.inspect",
      args: { input },
    })),
  ).map((response) => {
    if (!response.ok) {
      throw new Error(`tid.inspect failed: ${JSON.stringify(response)}`);
    }
    return response;
  });
}

function classifyWithTypescript(input: string): Record<string, unknown> {
  try {
    const tid = parseTid(input);
    return {
      syntaxValid: true,
      supportedKind: true,
      kind: tid[0] as TidKind,
    };
  } catch (error) {
    if (!(error instanceof GcsPrimitiveError)) throw error;
    return {
      syntaxValid: error.code === "INVALID_TID_KIND",
      supportedKind: false,
      kind: input[0] ?? "",
    };
  }
}
