import {
  fxpFromInteger,
  multiplyFxp,
  parseFxp,
  type Fxp,
} from "../../fxp/index.js";
import {
  normalizeFraction,
  type Fraction,
} from "./fraction.js";

export type CostAdjustmentKind =
  | "addition"
  | "percentage_adder"
  | "percentage_multiplier"
  | "multiplier";

export type CostAdjustment = Readonly<{
  kind: CostAdjustmentKind;
  value: Fraction;
}>;

const ZERO = fxpFromInteger(0n);
const ONE = fxpFromInteger(1n);
const HUNDRED = fxpFromInteger(100n);

function classifyCostAdjustment(input: string): CostAdjustmentKind {
  const normalized = input.trim().toLowerCase();
  if (normalized.endsWith("%")) {
    return normalized.startsWith("x") || normalized.startsWith("×")
      ? "percentage_multiplier"
      : "percentage_adder";
  }
  if (
    normalized.startsWith("x") ||
    normalized.startsWith("×") ||
    normalized.endsWith("x") ||
    normalized.endsWith("×")
  ) {
    return "multiplier";
  }
  return "addition";
}

function parseFxpForced(input: string): Fxp {
  try {
    return parseFxp(input);
  } catch {
    return ZERO;
  }
}

function extractFraction(input: string): Fraction {
  let value = input.trim().replace(/^[x×]+/, "");
  while (value !== "" && !/[0-9]$/.test(value)) {
    value = value.slice(0, -1);
  }
  const slash = value.indexOf("/");
  return {
    numerator: parseFxpForced((slash === -1 ? value : value.slice(0, slash)).trim()),
    denominator:
      slash === -1 ? ONE : parseFxpForced(value.slice(slash + 1).trim()),
  };
}

export function parseCostAdjustment(input: string): CostAdjustment {
  const kind = classifyCostAdjustment(input);
  const extracted = extractFraction(input);
  const value =
    kind === "percentage_multiplier" && extracted.numerator < ZERO
      ? { numerator: HUNDRED, denominator: ONE }
      : kind === "multiplier" && extracted.numerator < ZERO
        ? { numerator: ONE, denominator: ONE }
        : extracted;
  return { kind, value: normalizeFraction(value) };
}

export function scaleCostAdjustment(
  adjustment: CostAdjustment,
  levelMultiplier: Fxp,
): CostAdjustment {
  return {
    kind: adjustment.kind,
    value: normalizeFraction({
      numerator: multiplyFxp(adjustment.value.numerator, levelMultiplier),
      denominator: adjustment.value.denominator,
    }),
  };
}
