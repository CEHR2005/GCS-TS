import { describe, expect, it } from "vitest";

import {
  absFxp,
  addFxp,
  applyFxpRounding,
  ceilFxp,
  divideFxp,
  floorFxp,
  FXP_MAX_RAW,
  FXP_MIN_RAW,
  fxpFromRaw,
  fxpToRaw,
  maxFxp,
  minFxp,
  moduloFxp,
  multiplyFxp,
  roundFxp,
  subtractFxp,
  truncateFxp,
  type Fxp,
} from "@gcs/gcs-engine";

const from = (value: bigint): Fxp => fxpFromRaw(value);
const raw = (value: Fxp): bigint => fxpToRaw(value);

describe("fixed-point arithmetic", () => {
  it("matches the pinned arithmetic vectors", () => {
    expect(raw(addFxp(from(FXP_MAX_RAW), from(1n)))).toBe(FXP_MIN_RAW);
    expect(raw(subtractFxp(from(FXP_MIN_RAW), from(1n)))).toBe(FXP_MAX_RAW);
    expect(raw(multiplyFxp(from(FXP_MAX_RAW), from(20_000n)))).toBe(
      FXP_MAX_RAW,
    );
    expect(raw(divideFxp(from(-55_000n), from(20_000n)))).toBe(-27_500n);
    expect(raw(moduloFxp(from(-55_000n), from(20_000n)))).toBe(-15_000n);
    expect(raw(absFxp(from(FXP_MIN_RAW)))).toBe(FXP_MIN_RAW);
    expect(raw(truncateFxp(from(-19_999n)))).toBe(-10_000n);
    expect(raw(floorFxp(from(-10_001n)))).toBe(-20_000n);
    expect(raw(ceilFxp(from(10_001n)))).toBe(20_000n);
    expect(raw(roundFxp(from(15_000n)))).toBe(20_000n);
    expect(raw(roundFxp(from(-15_000n)))).toBe(-20_000n);
    expect(raw(minFxp(from(1n), from(2n)))).toBe(1n);
    expect(raw(maxFxp(from(1n), from(2n)))).toBe(2n);
    expect(raw(applyFxpRounding(from(-10_001n), true))).toBe(-20_000n);
    expect(raw(applyFxpRounding(from(-10_001n), false))).toBe(-10_000n);
  });

  it.each([
    ["divide", divideFxp],
    ["modulo", moduloFxp],
  ] as const)(
    "%s rejects every zero divisor, including zero divided by zero",
    (_name, operation) => {
      for (const dividend of [0n, 1n, -1n]) {
        expect(() => operation(from(dividend), from(0n))).toThrowError(
          expect.objectContaining({ code: "DIVIDE_BY_ZERO" }),
        );
      }
    },
  );

  it.each([
    ["MAX modulo 1", FXP_MAX_RAW, 1n, 9_222_449_699_651_090_330n],
    ["MAX modulo -1", FXP_MAX_RAW, -1n, 9_222_449_699_651_090_330n],
    ["MIN modulo 1", FXP_MIN_RAW, 1n, -9_222_449_699_651_090_331n],
    ["MIN modulo -1", FXP_MIN_RAW, -1n, -9_222_449_699_651_090_331n],
  ] as const)(
    "uses pinned saturated division for %s",
    (_case, left, right, expected) => {
      expect(raw(moduloFxp(from(left), from(right)))).toBe(expected);
    },
  );

  it.each([
    [
      "floor/MIN+9999",
      floorFxp,
      FXP_MIN_RAW + 9_999n,
      -9_223_372_036_854_770_000n,
    ],
    [
      "ceil/MAX-9999",
      ceilFxp,
      FXP_MAX_RAW - 9_999n,
      9_223_372_036_854_770_000n,
    ],
    [
      "round/MIN+4999",
      roundFxp,
      FXP_MIN_RAW + 4_999n,
      -9_223_372_036_854_770_000n,
    ],
    [
      "round/MAX-4999",
      roundFxp,
      FXP_MAX_RAW - 4_999n,
      9_223_372_036_854_770_000n,
    ],
  ] as const)(
    "%s evaluates the rounded candidate before saturation",
    (_case, operation, input, expected) => {
      expect(raw(operation(from(input)))).toBe(expected);
    },
  );

  it.each([
    ["floor/MAX", floorFxp, FXP_MAX_RAW, 9_223_372_036_854_770_000n],
    ["floor/MAX-1", floorFxp, FXP_MAX_RAW - 1n, 9_223_372_036_854_770_000n],
    ["floor/MIN", floorFxp, FXP_MIN_RAW, FXP_MIN_RAW],
    ["floor/MIN+1", floorFxp, FXP_MIN_RAW + 1n, FXP_MIN_RAW],
    ["ceil/MAX", ceilFxp, FXP_MAX_RAW, FXP_MAX_RAW],
    ["ceil/MAX-1", ceilFxp, FXP_MAX_RAW - 1n, FXP_MAX_RAW],
    ["ceil/MIN", ceilFxp, FXP_MIN_RAW, -9_223_372_036_854_770_000n],
    ["ceil/MIN+1", ceilFxp, FXP_MIN_RAW + 1n, -9_223_372_036_854_770_000n],
    ["round/MAX", roundFxp, FXP_MAX_RAW, FXP_MAX_RAW],
    ["round/MAX-1", roundFxp, FXP_MAX_RAW - 1n, FXP_MAX_RAW],
    ["round/MIN", roundFxp, FXP_MIN_RAW, FXP_MIN_RAW],
    ["round/MIN+1", roundFxp, FXP_MIN_RAW + 1n, FXP_MIN_RAW],
  ] as const)(
    "%s preserves pinned raw boundary saturation",
    (_case, operation, input, expected) => {
      expect(raw(operation(from(input)))).toBe(expected);
    },
  );

  it.each([
    ["multiply/MAX", multiplyFxp, FXP_MAX_RAW, 10_001n, FXP_MAX_RAW],
    ["multiply/MAX-1", multiplyFxp, FXP_MAX_RAW - 1n, 10_001n, FXP_MAX_RAW],
    ["multiply/MIN", multiplyFxp, FXP_MIN_RAW, 10_001n, FXP_MIN_RAW],
    ["multiply/MIN+1", multiplyFxp, FXP_MIN_RAW + 1n, 10_001n, FXP_MIN_RAW],
    ["divide/MAX", divideFxp, FXP_MAX_RAW, 9_999n, FXP_MAX_RAW],
    ["divide/MAX-1", divideFxp, FXP_MAX_RAW - 1n, 9_999n, FXP_MAX_RAW],
    ["divide/MIN", divideFxp, FXP_MIN_RAW, 9_999n, FXP_MIN_RAW],
    ["divide/MIN+1", divideFxp, FXP_MIN_RAW + 1n, 9_999n, FXP_MIN_RAW],
  ] as const)(
    "%s saturates at the pinned raw boundary",
    (_case, operation, left, right, expected) => {
      expect(raw(operation(from(left), from(right)))).toBe(expected);
    },
  );
});
