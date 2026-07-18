import { describe, expect, it } from "vitest";

import {
  fxpToRaw,
  projectGcsTraitsV5,
  type GcsDocumentV5,
} from "@gcs/gcs-engine";

const TRAIT_ID = "tAAECAwQFBgcICQoL";

function expectUnsafe(value: unknown): void {
  const document = {
    version: 5,
    traits: [{ id: TRAIT_ID, base_points: value }],
  } as unknown as GcsDocumentV5;

  expect(() => projectGcsTraitsV5(document)).toThrowError(
    expect.objectContaining({
      code: "UNSAFE_FXP_NUMBER",
      path: "/traits/0/base_points",
    }),
  );
}

describe("trait fixed-point number safety", () => {
  it.each([
    [900719925474.0991, 9_007_199_254_740_991n],
    [-900719925474.0991, -9_007_199_254_740_991n],
  ])("projects the inclusive safe boundary %s", (value, raw) => {
    const output = projectGcsTraitsV5({
      version: 5,
      traits: [{ id: TRAIT_ID, base_points: value }],
    });

    expect(output?.[0]?.kind).toBe("trait");
    if (output?.[0]?.kind !== "trait") {
      throw new Error("expected projected trait");
    }
    expect(fxpToRaw(output[0].basePoints!)).toBe(raw);
  });

  it.each([
    900719925474.0992,
    -900719925474.0992,
    1.23456,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])("rejects unsafe fixed-point number %s", (value) => {
    expectUnsafe(value);
  });
});
