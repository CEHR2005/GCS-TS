import { GcsPrimitiveError } from "../primitive-errors.js";
import { FXP_MAX_RAW, FXP_MIN_RAW, FXP_SCALE, type Fxp } from "./types.js";

const HALF_SCALE = FXP_SCALE / 2n;

const wrapSigned64 = (raw: bigint): Fxp => BigInt.asIntN(64, raw) as Fxp;

const saturateSigned64 = (raw: bigint): Fxp =>
  (raw > FXP_MAX_RAW
    ? FXP_MAX_RAW
    : raw < FXP_MIN_RAW
      ? FXP_MIN_RAW
      : raw) as Fxp;

function divideByZero(): never {
  throw new GcsPrimitiveError("DIVIDE_BY_ZERO", "Division by zero");
}

export function addFxp(left: Fxp, right: Fxp): Fxp {
  return wrapSigned64(left + right);
}

export function subtractFxp(left: Fxp, right: Fxp): Fxp {
  return wrapSigned64(left - right);
}

export function multiplyFxp(left: Fxp, right: Fxp): Fxp {
  return saturateSigned64((left * right) / FXP_SCALE);
}

export function divideFxp(left: Fxp, right: Fxp): Fxp {
  if (right === 0n) divideByZero();
  return saturateSigned64((left * FXP_SCALE) / right);
}

export function moduloFxp(left: Fxp, right: Fxp): Fxp {
  if (right === 0n) divideByZero();
  const quotient = truncateFxp(divideFxp(left, right));
  return subtractFxp(left, multiplyFxp(right, quotient));
}

export function absFxp(value: Fxp): Fxp {
  return value < 0n ? wrapSigned64(-value) : value;
}

export function truncateFxp(value: Fxp): Fxp {
  return ((value / FXP_SCALE) * FXP_SCALE) as Fxp;
}

export function floorFxp(value: Fxp): Fxp {
  const truncated = truncateFxp(value);
  if (value >= 0n || value === truncated) return truncated;
  return saturateSigned64(truncated - FXP_SCALE);
}

export function ceilFxp(value: Fxp): Fxp {
  const truncated = truncateFxp(value);
  if (value <= 0n || value === truncated) return truncated;
  return saturateSigned64(truncated + FXP_SCALE);
}

export function roundFxp(value: Fxp): Fxp {
  const adjusted = value < 0n ? value - HALF_SCALE : value + HALF_SCALE;
  return saturateSigned64((adjusted / FXP_SCALE) * FXP_SCALE);
}

export function minFxp(left: Fxp, right: Fxp): Fxp {
  return left < right ? left : right;
}

export function maxFxp(left: Fxp, right: Fxp): Fxp {
  return left > right ? left : right;
}

export function applyFxpRounding(value: Fxp, roundDown: boolean): Fxp {
  return roundDown ? floorFxp(value) : ceilFxp(value);
}
