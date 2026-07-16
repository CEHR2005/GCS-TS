import { describe, expect, it } from "vitest";

import {
  GcsParseError,
  parseGcsV5,
  serializeGcsV5,
  type GcsDocumentV5,
  type GcsParseErrorCode,
} from "../src/index.js";

function expectGcsError(
  operation: () => unknown,
  expected: { code: GcsParseErrorCode; path?: string },
): void {
  try {
    operation();
    throw new Error("Expected operation to throw a GcsParseError");
  } catch (error) {
    expect(error).toBeInstanceOf(GcsParseError);
    expect(error).toMatchObject(expected);
  }
}

describe("serializeGcsV5", () => {
  it("preserves document semantics with tab indentation and one final newline", () => {
    const document = parseGcsV5(
      JSON.stringify({
        version: 5,
        profile: { name: "Ирина" },
        third_party: { nested: [true, 1.25, { value: "未知" }] },
        unknown_extension: { enabled: false },
      }),
    );

    const output = serializeGcsV5(document);

    expect(output.endsWith("\n")).toBe(true);
    expect(output.endsWith("\n\n")).toBe(false);
    expect(output).toContain('\n\t"profile"');
    expect(JSON.parse(output)).toEqual(document);
  });

  it("rejects an in-memory document without a version", () => {
    expectGcsError(() => serializeGcsV5({} as GcsDocumentV5), {
      code: "MISSING_VERSION",
    });
  });
});
