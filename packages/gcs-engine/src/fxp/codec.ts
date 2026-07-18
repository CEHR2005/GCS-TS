import { GcsPrimitiveError } from "../primitive-errors.js";
import { FXP_MAX_RAW, FXP_MIN_RAW, FXP_SCALE, type Fxp } from "./types.js";

function invalidFxp(input: string): never {
  throw new GcsPrimitiveError(
    "INVALID_FXP",
    `Invalid fixed-point value: ${input}`,
  );
}

export function fxpFromRaw(raw: bigint): Fxp {
  if (raw < FXP_MIN_RAW || raw > FXP_MAX_RAW) {
    throw new GcsPrimitiveError(
      "FXP_OUT_OF_RANGE",
      `Fixed-point raw value is outside the signed 64-bit range: ${raw}`,
    );
  }

  return raw as Fxp;
}

export function fxpToRaw(value: Fxp): bigint {
  return value;
}

export function fxpFromInteger(value: bigint): Fxp {
  return fxpFromRaw(value * FXP_SCALE);
}

function parseDecimalFxp(input: string): Fxp {
  const withoutCommas = input.replaceAll(",", "");

  if (withoutCommas === "" && input !== "") return fxpFromRaw(0n);
  if (/^[+-]?\.?$/.test(withoutCommas)) return fxpFromRaw(0n);
  if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(withoutCommas)) {
    return invalidFxp(input);
  }

  const negative = withoutCommas.startsWith("-");
  const magnitudeText = /^[+-]/.test(withoutCommas)
    ? withoutCommas.slice(1)
    : withoutCommas;
  const [integerText = "", fractionText = ""] = magnitudeText.split(".");
  const integer = BigInt(integerText || "0");
  const fraction = BigInt((fractionText + "0000").slice(0, 4));
  const magnitude = integer * FXP_SCALE + fraction;

  return fxpFromRaw(negative ? -magnitude : magnitude);
}

/**
 * Supports legacy exponent notation through JavaScript number conversion.
 * This compatibility path is deliberately isolated; ordinary decimal parsing
 * is exact and uses bigint exclusively.
 */
const EXPONENT_DIGITS = String.raw`[0-9](?:_?[0-9])*`;
const EXPONENT_INPUT = new RegExp(
  String.raw`^[+-]?(?:${EXPONENT_DIGITS}(?:\.(?:${EXPONENT_DIGITS})?)?|\.${EXPONENT_DIGITS})[eE][+-]?${EXPONENT_DIGITS}$`,
);

function parseExponentFxp(input: string): Fxp {
  const withoutCommas = input.replaceAll(",", "");
  if (!EXPONENT_INPUT.test(withoutCommas)) {
    return invalidFxp(input);
  }

  const numericValue = Number(withoutCommas.replaceAll("_", ""));
  if (!Number.isFinite(numericValue)) {
    throw new GcsPrimitiveError(
      "FXP_OUT_OF_RANGE",
      `Fixed-point value is outside the signed 64-bit range: ${input}`,
    );
  }

  const minimumValue = Number(FXP_MIN_RAW) / Number(FXP_SCALE);
  const maximumValue = Number(FXP_MAX_RAW) / Number(FXP_SCALE);
  if (numericValue < minimumValue || numericValue > maximumValue) {
    throw new GcsPrimitiveError(
      "FXP_OUT_OF_RANGE",
      `Fixed-point value is outside the signed 64-bit range: ${input}`,
    );
  }

  return parseDecimalFxp(numericValue.toFixed(5));
}

export function parseFxp(input: string): Fxp {
  if (input === "" || input.trim() !== input) return invalidFxp(input);
  return /[eE]/.test(input) ? parseExponentFxp(input) : parseDecimalFxp(input);
}

export function formatFxp(value: Fxp): string {
  const raw = fxpToRaw(value);
  const negative = raw < 0n;
  const absolute = negative ? -raw : raw;
  const integer = absolute / FXP_SCALE;
  const fraction = (absolute % FXP_SCALE)
    .toString()
    .padStart(4, "0")
    .replace(/0+$/, "");
  const sign = negative ? "-" : "";

  return fraction === ""
    ? `${sign}${integer}`
    : `${sign}${integer}.${fraction}`;
}
