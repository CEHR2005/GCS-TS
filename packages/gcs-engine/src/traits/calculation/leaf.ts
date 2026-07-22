import {
  addFxp,
  applyFxpRounding,
  fxpFromInteger,
  multiplyFxp,
  type Fxp,
} from "../../fxp/index.js";
import type {
  GcsTraitModifierNodeV5,
  GcsTraitModifierV5,
  GcsTraitV5,
} from "../types.js";
import { parseCostAdjustment, scaleCostAdjustment } from "./cost-adjustment.js";
import {
  addFractions,
  divideFractions,
  fractionValue,
  multiplyFractions,
  type Fraction,
} from "./fraction.js";
import type { GcsTraitCalculationV5 } from "./types.js";

type LeafContext = Readonly<{
  effectivelyDisabled: boolean;
  inheritedModifiers: readonly GcsTraitModifierNodeV5[];
  useMultiplicativeModifiers: boolean;
}>;

const ZERO = fxpFromInteger(0n);
const ONE = fxpFromInteger(1n);
const NEGATIVE_EIGHTY = fxpFromInteger(-80n);
const HUNDRED = fxpFromInteger(100n);
const fraction = (numerator: Fxp): Fraction => ({
  numerator,
  denominator: ONE,
});

function currentLevel(trait: GcsTraitV5): Fxp {
  if (!trait.canLevel || (trait.levels ?? ZERO) < ZERO) return ZERO;
  return trait.levels ?? ZERO;
}

function selfControlMultiplier(value: GcsTraitV5["selfControlRoll"]): Fxp {
  const raw: Record<number, bigint> = {
    1: 25_000n,
    6: 20_000n,
    7: 18_300n,
    8: 16_700n,
    9: 15_000n,
    10: 13_300n,
    11: 11_700n,
    12: 10_000n,
    13: 8_300n,
    14: 6_700n,
    15: 5_000n,
  };
  return (raw[value ?? 0] ?? 10_000n) as Fxp;
}

function frequencyMultiplier(value: GcsTraitV5["frequency"]): Fxp {
  const raw: Record<number, bigint> = {
    6: 5_000n,
    9: 10_000n,
    12: 20_000n,
    15: 30_000n,
    18: 40_000n,
  };
  return (raw[value ?? 0] ?? 10_000n) as Fxp;
}

function* enabledLeaves(
  nodes: readonly GcsTraitModifierNodeV5[],
): Generator<GcsTraitModifierV5> {
  for (const node of nodes) {
    if (node.kind === "trait_modifier") {
      if (!node.disabled) yield node;
    } else if (node.children !== undefined) {
      yield* enabledLeaves(node.children);
    }
  }
}

function equalFractions(left: Fraction, right: Fraction): boolean {
  return (
    left.numerator === right.numerator && left.denominator === right.denominator
  );
}

function clampLimitation(value: Fraction): Fraction {
  return fractionValue(value) < NEGATIVE_EIGHTY
    ? fraction(NEGATIVE_EIGHTY)
    : value;
}

function modifyPoints(points: Fraction, modifier: Fraction): Fraction {
  return addFractions(
    points,
    divideFractions(multiplyFractions(points, modifier), fraction(HUNDRED)),
  );
}

export function calculateLeafTrait(
  trait: GcsTraitV5,
  context: LeafContext,
): GcsTraitCalculationV5 {
  if (context.effectivelyDisabled) {
    return Object.freeze({
      kind: "trait",
      id: trait.id,
      currentLevel: ZERO,
      adjustedPoints: ZERO,
    });
  }

  const canLevel = trait.canLevel ?? false;
  const levels = canLevel ? (trait.levels ?? ZERO) : ZERO;
  let basePoints = trait.basePoints ?? ZERO;
  let pointsPerLevel = canLevel ? (trait.pointsPerLevel ?? ZERO) : ZERO;
  let baseLim = fraction(ZERO);
  let levelLim = fraction(ZERO);
  let baseEnh = fraction(ZERO);
  let levelEnh = fraction(ZERO);
  let multiplier = fraction(
    multiplyFxp(
      selfControlMultiplier(trait.selfControlRoll),
      frequencyMultiplier(trait.frequency),
    ),
  );

  const lists = [
    trait.modifiers ?? [],
    ...context.inheritedModifiers.map((one) => [one]),
  ];
  for (const list of lists) {
    for (const mod of enabledLeaves(list)) {
      const levelMultiplier = mod.useLevelFromTrait
        ? canLevel && currentLevel(trait) > ZERO
          ? currentLevel(trait)
          : ONE
        : (mod.levels ?? ZERO) > ZERO
          ? (mod.levels as Fxp)
          : ONE;
      const adjustment = scaleCostAdjustment(
        parseCostAdjustment(mod.costAdjustment ?? ""),
        levelMultiplier,
      );
      if (adjustment.kind === "addition") {
        if (mod.affects === "levels_only") {
          if (canLevel)
            pointsPerLevel = addFxp(
              pointsPerLevel,
              fractionValue(adjustment.value),
            );
        } else {
          basePoints = addFxp(basePoints, fractionValue(adjustment.value));
        }
      } else if (adjustment.kind === "percentage_adder") {
        const limitation = adjustment.value.numerator < ZERO;
        if (mod.affects !== "levels_only") {
          if (limitation) baseLim = addFractions(baseLim, adjustment.value);
          else baseEnh = addFractions(baseEnh, adjustment.value);
        }
        if (mod.affects !== "base_only") {
          if (limitation) levelLim = addFractions(levelLim, adjustment.value);
          else levelEnh = addFractions(levelEnh, adjustment.value);
        }
      } else if (adjustment.kind === "percentage_multiplier") {
        multiplier = divideFractions(
          multiplyFractions(multiplier, adjustment.value),
          fraction(HUNDRED),
        );
      } else {
        multiplier = multiplyFractions(multiplier, adjustment.value);
      }
    }
  }

  let modifiedBase = fraction(basePoints);
  const leveled = fraction(multiplyFxp(pointsPerLevel, levels));
  const hasPercentages = [baseLim, levelLim, baseEnh, levelEnh].some(
    (value) => value.numerator !== ZERO,
  );
  if (!hasPercentages) {
    modifiedBase = addFractions(modifiedBase, leveled);
  } else if (context.useMultiplicativeModifiers) {
    if (
      equalFractions(baseEnh, levelEnh) &&
      equalFractions(baseLim, levelLim)
    ) {
      modifiedBase = modifyPoints(
        modifyPoints(addFractions(modifiedBase, leveled), baseEnh),
        clampLimitation(baseLim),
      );
    } else {
      modifiedBase = modifyPoints(
        modifyPoints(modifiedBase, baseEnh),
        clampLimitation(baseLim),
      );
      modifiedBase = addFractions(
        modifiedBase,
        modifyPoints(
          modifyPoints(leveled, levelEnh),
          clampLimitation(levelLim),
        ),
      );
    }
  } else {
    const baseModifier = clampLimitation(addFractions(baseEnh, baseLim));
    const levelModifier = clampLimitation(addFractions(levelEnh, levelLim));
    if (equalFractions(baseModifier, levelModifier)) {
      modifiedBase = modifyPoints(
        addFractions(modifiedBase, leveled),
        baseModifier,
      );
    } else {
      modifiedBase = addFractions(
        modifyPoints(modifiedBase, baseModifier),
        modifyPoints(leveled, levelModifier),
      );
    }
  }

  return Object.freeze({
    kind: "trait",
    id: trait.id,
    currentLevel: currentLevel(trait),
    adjustedPoints: applyFxpRounding(
      fractionValue(multiplyFractions(modifiedBase, multiplier)),
      trait.roundDown ?? false,
    ),
  });
}
