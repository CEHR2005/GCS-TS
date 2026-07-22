import {
  addFxp,
  divideFxp,
  fxpFromInteger,
  multiplyFxp,
  type Fxp,
} from "../../fxp/index.js";

export type Fraction = Readonly<{
  numerator: Fxp;
  denominator: Fxp;
}>;

const ZERO = fxpFromInteger(0n);
const ONE = fxpFromInteger(1n);
const NEGATIVE_ONE = fxpFromInteger(-1n);

export function normalizeFraction(value: Fraction): Fraction {
  if (value.denominator === ZERO) {
    return { numerator: ZERO, denominator: ONE };
  }
  if (value.denominator < ZERO) {
    return {
      numerator: multiplyFxp(value.numerator, NEGATIVE_ONE),
      denominator: multiplyFxp(value.denominator, NEGATIVE_ONE),
    };
  }
  return value;
}

export function addFractions(left: Fraction, right: Fraction): Fraction {
  const normalizedLeft = normalizeFraction(left);
  const normalizedRight = normalizeFraction(right);
  return {
    numerator: addFxp(
      multiplyFxp(normalizedLeft.numerator, normalizedRight.denominator),
      multiplyFxp(normalizedRight.numerator, normalizedLeft.denominator),
    ),
    denominator: multiplyFxp(
      normalizedLeft.denominator,
      normalizedRight.denominator,
    ),
  };
}

export function multiplyFractions(left: Fraction, right: Fraction): Fraction {
  const normalizedLeft = normalizeFraction(left);
  const normalizedRight = normalizeFraction(right);
  return {
    numerator: multiplyFxp(
      normalizedLeft.numerator,
      normalizedRight.numerator,
    ),
    denominator: multiplyFxp(
      normalizedLeft.denominator,
      normalizedRight.denominator,
    ),
  };
}

export function divideFractions(left: Fraction, right: Fraction): Fraction {
  const normalizedLeft = normalizeFraction(left);
  const normalizedRight = normalizeFraction(right);
  return {
    numerator: multiplyFxp(
      normalizedLeft.numerator,
      normalizedRight.denominator,
    ),
    denominator: multiplyFxp(
      normalizedLeft.denominator,
      normalizedRight.numerator,
    ),
  };
}

export function fractionValue(value: Fraction): Fxp {
  const normalized = normalizeFraction(value);
  return divideFxp(normalized.numerator, normalized.denominator);
}
