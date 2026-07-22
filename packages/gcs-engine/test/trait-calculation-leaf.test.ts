import { describe, expect, it } from "vitest";

import type { Fxp } from "../src/fxp/index.js";
import { calculateLeafTrait } from "../src/traits/calculation/leaf.js";
import type {
  GcsTraitModifierNodeV5,
  GcsTraitV5,
} from "../src/traits/types.js";

const raw = (value: number): Fxp => BigInt(value * 10_000) as Fxp;
const id = (value: string) => value as GcsTraitV5["id"];

const trait = (overrides: Partial<GcsTraitV5> = {}): GcsTraitV5 => ({
  kind: "trait",
  id: id("00000000-0000-0000-0000-000000000001"),
  ...overrides,
});

const modifier = (
  costAdjustment: string,
  overrides: Record<string, unknown> = {},
): GcsTraitModifierNodeV5 =>
  ({
    kind: "trait_modifier",
    id: id("00000000-0000-0000-0000-000000000002"),
    costAdjustment,
    ...overrides,
  }) as GcsTraitModifierNodeV5;

const calculate = (
  input: GcsTraitV5,
  overrides: Partial<{
    effectivelyDisabled: boolean;
    inheritedModifiers: readonly GcsTraitModifierNodeV5[];
    useMultiplicativeModifiers: boolean;
  }> = {},
) =>
  calculateLeafTrait(input, {
    effectivelyDisabled: false,
    inheritedModifiers: [],
    useMultiplicativeModifiers: false,
    ...overrides,
  });

describe("calculateLeafTrait", () => {
  it.each([
    ["absent values", trait(), 0, 0],
    [
      "canLevel false",
      trait({ basePoints: raw(10), levels: raw(3), pointsPerLevel: raw(2) }),
      0,
      10,
    ],
    [
      "positive levels",
      trait({
        basePoints: raw(10),
        canLevel: true,
        levels: raw(3),
        pointsPerLevel: raw(2),
      }),
      3,
      16,
    ],
    [
      "negative persisted levels",
      trait({
        basePoints: raw(10),
        canLevel: true,
        levels: raw(-3),
        pointsPerLevel: raw(2),
      }),
      0,
      4,
    ],
  ])("handles %s", (_name, input, level, points) => {
    expect(calculate(input)).toEqual({
      kind: "trait",
      id: input.id,
      currentLevel: raw(level),
      adjustedPoints: raw(points),
    });
  });

  it.each([
    ["own", [modifier("+2")], [], 12],
    ["inherited", [], [modifier("+2")], 12],
    [
      "nested",
      [
        {
          kind: "trait_modifier_container",
          id: id("00000000-0000-0000-0000-000000000003"),
          children: [modifier("+2")],
        } as GcsTraitModifierNodeV5,
      ],
      [],
      12,
    ],
    ["disabled leaf", [modifier("+2", { disabled: true })], [], 10],
    [
      "disabled container",
      [
        {
          kind: "trait_modifier_container",
          id: id("00000000-0000-0000-0000-000000000004"),
          children: [modifier("+2")],
          disabled: true,
        } as GcsTraitModifierNodeV5,
      ],
      [],
      12,
    ],
  ])(
    "applies %s modifier traversal",
    (_name, modifiers, inheritedModifiers, points) => {
      expect(
        calculate(trait({ basePoints: raw(10), modifiers }), {
          inheritedModifiers,
        }).adjustedPoints,
      ).toBe(raw(points));
    },
  );

  it.each([
    ["total addition", "+2", "total", 10, 4, 16],
    ["base addition", "+2", "base_only", 10, 4, 16],
    ["level addition", "+2", "levels_only", 10, 4, 16],
    ["positive total percentage", "+50%", "total", 10, 4, 21],
    ["positive base percentage", "+50%", "base_only", 10, 4, 19],
    ["positive level percentage", "+50%", "levels_only", 10, 4, 16],
    ["negative percentage", "-20%", "total", 10, 4, 12],
    ["limitation floor", "-90%", "total", 10, 4, 3],
    ["percentage multiplier", "x50%", "total", 10, 4, 7],
    ["ASCII multiplier", "x1.5", "total", 10, 4, 21],
    ["Unicode multiplier", "×2", "total", 10, 4, 28],
    ["ASCII suffix multiplier", "1.5x", "total", 10, 4, 21],
    ["Unicode suffix multiplier", "1.5×", "total", 10, 4, 21],
  ])("applies %s", (_name, costAdjustment, affects, base, perLevel, points) => {
    const input = trait({
      basePoints: raw(base),
      canLevel: true,
      levels: raw(1),
      pointsPerLevel: raw(perLevel),
      modifiers: [modifier(costAdjustment, { affects })],
    });
    expect(calculate(input).adjustedPoints).toBe(raw(points));
  });

  it.each([
    ["own levels", modifier("+2", { levels: raw(3) }), 16],
    ["trait levels", modifier("+2", { useLevelFromTrait: true }), 16],
    ["minimum one", modifier("+2", { levels: raw(-3) }), 12],
  ])("applies leveled modifier %s", (_name, mod, points) => {
    const input = trait({
      basePoints: raw(10),
      canLevel: true,
      levels: raw(3),
      modifiers: [mod],
    });
    expect(calculate(input).adjustedPoints).toBe(raw(points));
  });

  it.each([
    ["zero", raw(0)],
    ["negative", raw(-3)],
  ])(
    "uses minimum one for useLevelFromTrait at %s trait level",
    (_name, levels) => {
      const input = trait({
        basePoints: raw(10),
        canLevel: true,
        levels,
        modifiers: [modifier("+2", { useLevelFromTrait: true })],
      });
      expect(calculate(input).adjustedPoints).toBe(raw(12));
    },
  );

  it("preserves own then nearest-parent then outward traversal order", () => {
    const input = trait({
      modifiers: [modifier("+922337203685477.5807")],
    });
    const inheritedModifiers = [
      modifier("+0.0001"),
      modifier("-922337203685477.5807"),
    ];
    expect(calculate(input, { inheritedModifiers }).adjustedPoints).toBe(
      raw(1),
    );
  });

  it("distinguishes additive and multiplicative percentage modes", () => {
    const input = trait({
      basePoints: raw(100),
      modifiers: [modifier("+50%"), modifier("-20%")],
    });
    expect(calculate(input).adjustedPoints).toBe(raw(130));
    expect(
      calculate(input, { useMultiplicativeModifiers: true }).adjustedPoints,
    ).toBe(raw(120));
  });

  it.each([
    ["self-control", { selfControlRoll: 6 as const }, 20],
    ["frequency", { frequency: 6 as const }, 5],
    ["both", { selfControlRoll: 6 as const, frequency: 6 as const }, 10],
  ])("applies %s multiplier", (_name, fields, points) => {
    expect(
      calculate(trait({ basePoints: raw(10), ...fields })).adjustedPoints,
    ).toBe(raw(points));
  });

  it.each([
    ["ceiling", false, 2],
    ["floor", true, 1],
  ])("uses %s rounding", (_name, roundDown, points) => {
    expect(
      calculate(
        trait({ basePoints: raw(1), roundDown, modifiers: [modifier("x1.5")] }),
      ).adjustedPoints,
    ).toBe(raw(points));
  });

  it("returns zero for disabled state", () => {
    const input = trait({
      basePoints: raw(10),
      canLevel: true,
      levels: raw(3),
    });
    expect(calculate(input, { effectivelyDisabled: true })).toEqual({
      kind: "trait",
      id: input.id,
      currentLevel: raw(0),
      adjustedPoints: raw(0),
    });
  });

  it("freezes output and leaves input unchanged", () => {
    const input = trait({
      basePoints: raw(10),
      canLevel: true,
      levels: raw(-3),
      pointsPerLevel: raw(2),
    });
    const before = structuredClone(input);
    const result = calculate(input);
    expect(result.currentLevel).toBe(raw(0));
    expect(result.adjustedPoints).toBe(raw(4));
    expect(Object.isFrozen(result)).toBe(true);
    expect(input).toEqual(before);
  });
});
