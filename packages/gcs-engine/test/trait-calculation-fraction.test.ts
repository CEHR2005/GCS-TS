import { describe, expect, it } from "vitest";

import {
  FXP_MAX_RAW,
  FXP_MIN_RAW,
  fxpFromRaw,
  fxpToRaw,
  type Fxp,
} from "../src/fxp/index.js";
import {
  addFractions,
  divideFractions,
  fractionValue,
  multiplyFractions,
  normalizeFraction,
  type Fraction,
} from "../src/traits/calculation/fraction.js";

const raw = (value: bigint | number): Fxp => fxpFromRaw(BigInt(value) * 10_000n);
const rawValue = (value: Fxp): bigint => fxpToRaw(value);
const fraction = (numerator: bigint | number, denominator: bigint | number): Fraction => ({
  numerator: raw(numerator),
  denominator: raw(denominator),
});

describe("trait calculation fractions", () => {
  it.each([
    [fraction(4, -6), fraction(-4, 6)],
    [fraction(-4, -6), fraction(4, 6)],
    [fraction(0, -6), fraction(0, 6)],
    [fraction(0, 8), fraction(0, 8)],
    [fraction(5, 0), fraction(0, 1)],
  ])("normalizes pinned signs and zero denominators without gcd reduction", (input, expected) => {
    expect(normalizeFraction(input)).toEqual(expected);
  });

  it("adds fractions with pinned fixed-point operations and does not reduce", () => {
    expect(addFractions(fraction(1, 2), fraction(1, 3))).toEqual(fraction(5, 6));
  });

  it("multiplies fractions with pinned fixed-point operations and does not reduce", () => {
    expect(multiplyFractions(fraction(2, 3), fraction(3, 4))).toEqual(fraction(6, 12));
  });

  it("divides fractions by swapping the normalized right operand", () => {
    expect(divideFractions(fraction(2, 3), fraction(4, 5))).toEqual(fraction(10, 12));
    expect(divideFractions(fraction(2, 3), fraction(0, 5))).toEqual(fraction(10, 0));
  });

  it("returns the normalized fixed-point quotient", () => {
    expect(rawValue(fractionValue(fraction(2, 3)))).toBe(6_666n);
    expect(rawValue(fractionValue(fraction(5, 0)))).toBe(0n);
  });

  it("preserves signed-64 wrap for additions inside fraction addition", () => {
    const left = { numerator: fxpFromRaw(FXP_MAX_RAW), denominator: raw(1) };
    const right = fraction(1, 1);
    expect(rawValue(addFractions(left, right).numerator)).toBe(FXP_MIN_RAW + 9_999n);
  });

  it.each([
    [FXP_MAX_RAW, 20_000n, FXP_MAX_RAW],
    [FXP_MIN_RAW, 20_000n, FXP_MIN_RAW],
  ])("preserves signed-64 saturation for fraction multiplication", (boundary, factor, expected) => {
    const result = multiplyFractions(
      { numerator: fxpFromRaw(boundary), denominator: raw(1) },
      { numerator: fxpFromRaw(factor), denominator: raw(1) },
    );
    expect(rawValue(result.numerator)).toBe(expected);
  });

  it("normalizes the minimum raw denominator through pinned saturated multiplication", () => {
    expect(normalizeFraction({ numerator: raw(1), denominator: fxpFromRaw(FXP_MIN_RAW) })).toEqual({
      numerator: raw(-1),
      denominator: fxpFromRaw(FXP_MAX_RAW),
    });
  });
});
