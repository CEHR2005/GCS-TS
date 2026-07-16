import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GcsParseError, parseGcsV5 } from "../src/index.js";

type PackageManifest = {
  gcsCapabilities?: {
    dataVersions?: {
      supported?: unknown;
      unsupported?: unknown;
      unlisted?: unknown;
    };
  };
};

const packageManifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as PackageManifest;

describe("GCS data-version capabilities", () => {
  it("declares the exact supported and unsupported policy", () => {
    expect(packageManifest.gcsCapabilities).toEqual({
      dataVersions: {
        supported: [5],
        unsupported: [2, 3, 4],
        unlisted: "unsupported",
      },
    });
  });

  it("matches the declared support policy in the parser", () => {
    expect(parseGcsV5('{"version":5}')).toEqual({ version: 5 });

    for (const version of [2, 3, 4]) {
      expect(() => parseGcsV5(JSON.stringify({ version }))).toThrowError(
        expect.objectContaining<Partial<GcsParseError>>({
          code: "UNSUPPORTED_VERSION",
          path: "/version",
        }),
      );
    }
  });
});
