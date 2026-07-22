import { describe, expect, it } from "vitest";

import { fxpFromRaw, fxpToRaw, type Fxp } from "../src/fxp/index.js";
import {
  parseCostAdjustment,
  scaleCostAdjustment,
  type CostAdjustmentKind,
} from "../src/traits/calculation/cost-adjustment.js";

const fxp = (value: bigint | number): Fxp => fxpFromRaw(BigInt(value));

describe("trait cost adjustment compatibility", () => {
  it.each([
    ["+2", "addition", 20_000n, 10_000n],
    ["-10%", "percentage_adder", -100_000n, 10_000n],
    ["x50%", "percentage_multiplier", 500_000n, 10_000n],
    ["× 2/3", "multiplier", 20_000n, 30_000n],
    ["1.5x", "multiplier", 15_000n, 10_000n],
    ["+2 points", "addition", 20_000n, 10_000n],
    ["", "addition", 0n, 10_000n],
    ["-", "addition", 0n, 10_000n],
    ["x1/0", "multiplier", 0n, 10_000n],
    ["x-2", "multiplier", 10_000n, 10_000n],
    ["x-50%", "percentage_multiplier", 1_000_000n, 10_000n],
  ] as const)(
    "parses %s as %s with pinned permissive fraction semantics",
    (input, kind, numerator, denominator) => {
      const parsed = parseCostAdjustment(input);
      expect(parsed.kind).toBe(kind);
      expect(fxpToRaw(parsed.value.numerator)).toBe(numerator);
      expect(fxpToRaw(parsed.value.denominator)).toBe(denominator);
    },
  );

  it.each([
    [" X 25 % ", "percentage_multiplier", 0n, 10_000n],
    ["2×", "multiplier", 20_000n, 10_000n],
    ["××2", "multiplier", 20_000n, 10_000n],
    ["+2kg", "addition", 20_000n, 10_000n],
    ["5/2 lbs", "addition", 50_000n, 20_000n],
    ["1/2/3", "addition", 0n, 10_000n],
    ["x", "multiplier", 0n, 10_000n],
    ["%", "percentage_adder", 0n, 10_000n],
    ["x%", "percentage_multiplier", 0n, 10_000n],
  ] as const)(
    "handles marker forms, trailing units, and forced parsing for %s",
    (input, kind, numerator, denominator) => {
      const parsed = parseCostAdjustment(input);
      expect(parsed.kind).toBe(kind);
      expect(fxpToRaw(parsed.value.numerator)).toBe(numerator);
      expect(fxpToRaw(parsed.value.denominator)).toBe(denominator);
    },
  );

  it("scales only the numerator with the supplied leveled multiplier", () => {
    const parsed = parseCostAdjustment("+2/3");
    expect(scaleCostAdjustment(parsed, fxp(25_000n))).toEqual({
      kind: "addition" satisfies CostAdjustmentKind,
      value: { numerator: fxp(50_000n), denominator: fxp(30_000n) },
    });
  });

  it("does not implicitly apply a level multiplier to an explicit fraction", () => {
    expect(parseCostAdjustment("x2/3")).toEqual({
      kind: "multiplier" satisfies CostAdjustmentKind,
      value: { numerator: fxp(20_000n), denominator: fxp(30_000n) },
    });
  });

  it("normalizes scaling results with zero denominators", () => {
    expect(
      scaleCostAdjustment(
        { kind: "addition", value: { numerator: fxp(20_000n), denominator: fxp(0n) } },
        fxp(20_000n),
      ),
    ).toEqual({
      kind: "addition",
      value: { numerator: fxp(0n), denominator: fxp(10_000n) },
    });
  });
});
