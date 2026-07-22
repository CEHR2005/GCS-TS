import { describe, expect, expectTypeOf, it } from "vitest";

import {
  GcsTraitCalculationError,
  type GcsTraitCalculationErrorCode,
} from "@gcs/gcs-engine";

describe("trait calculation errors", () => {
  it("exports the exact error codes", () => {
    expectTypeOf<GcsTraitCalculationErrorCode>().toEqualTypeOf<
      "INVALID_OPTIONS" | "CYCLE_DETECTED" | "MAX_DEPTH_EXCEEDED"
    >();
  });

  it("retains its exact runtime fields", () => {
    const error = new GcsTraitCalculationError(
      "INVALID_OPTIONS",
      "useMultiplicativeModifiers must be a boolean",
      "/options/useMultiplicativeModifiers",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "GcsTraitCalculationError",
      code: "INVALID_OPTIONS",
      message: "useMultiplicativeModifiers must be a boolean",
      path: "/options/useMultiplicativeModifiers",
    });
  });
});
