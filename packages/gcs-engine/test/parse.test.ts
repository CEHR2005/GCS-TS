import { describe, expect, it } from "vitest";

import {
  GcsParseError,
  parseGcsV5,
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

describe("parseGcsV5", () => {
  it("accepts a version 5 document and preserves Unicode", () => {
    expect(parseGcsV5('{"version":5,"name":"Åsa"}')).toEqual({
      version: 5,
      name: "Åsa",
    });
  });

  it("rejects invalid UTF-8 byte input", () => {
    expectGcsError(() => parseGcsV5(new Uint8Array([0xff])), {
      code: "INVALID_UTF8",
    });
  });

  it("rejects malformed JSON", () => {
    expectGcsError(() => parseGcsV5("{"), { code: "INVALID_JSON" });
  });

  it("rejects a non-object root", () => {
    expectGcsError(() => parseGcsV5("[]"), { code: "ROOT_NOT_OBJECT" });
  });

  it("rejects a missing version", () => {
    expectGcsError(() => parseGcsV5("{}"), {
      code: "MISSING_VERSION",
      path: "/version",
    });
  });

  it("rejects version 4", () => {
    expectGcsError(() => parseGcsV5('{"version":4}'), {
      code: "UNSUPPORTED_VERSION",
      path: "/version",
    });
  });

  it("rejects version 1", () => {
    expectGcsError(() => parseGcsV5('{"version":1}'), {
      code: "UNSUPPORTED_VERSION",
      path: "/version",
    });
  });

  it("rejects version 6", () => {
    expectGcsError(() => parseGcsV5('{"version":6}'), {
      code: "UNSUPPORTED_VERSION",
      path: "/version",
    });
  });
});
