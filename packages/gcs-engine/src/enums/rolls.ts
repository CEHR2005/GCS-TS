import { GcsPrimitiveError } from "../primitive-errors.js";
import type { GcsEnumNormalization } from "./normalization.js";

export const SELF_CONTROL_ROLLS = Object.freeze([
  0, 1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
] as const);

export type SelfControlRoll = (typeof SELF_CONTROL_ROLLS)[number];

export const SELF_CONTROL_ADJUSTMENTS = Object.freeze([
  "none",
  "action_penalty",
  "reaction_penalty",
  "fright_check_penalty",
  "fright_check_bonus",
  "minor_cost_of_living_increase",
  "major_cost_of_living_increase",
] as const);

export type SelfControlAdjustment = (typeof SELF_CONTROL_ADJUSTMENTS)[number];

export const FREQUENCY_ROLLS = Object.freeze([0, 6, 9, 12, 15, 18] as const);

export type FrequencyRoll = (typeof FREQUENCY_ROLLS)[number];

function parseValue<T extends string | number>(
  values: readonly T[],
  input: T,
): T {
  if (typeof input !== typeof values[0]) return invalidEnum();
  if (values.includes(input)) return input;
  return invalidEnum();
}

function invalidEnum(): never {
  throw new GcsPrimitiveError("INVALID_ENUM", "Invalid enum value");
}

function equalFoldAsciiKey(key: string, input: string): boolean {
  const characters = [...input];
  if (characters.length !== key.length) return false;
  return characters.every((character, index) => {
    let folded = character;
    if (character >= "A" && character <= "Z") {
      folded = String.fromCharCode(character.charCodeAt(0) + 32);
    } else if (character === "ſ") {
      folded = "s";
    } else if (character === "K") {
      folded = "k";
    }
    return folded === key[index];
  });
}

function normalizeString<T extends string>(
  values: readonly T[],
  input: string,
): GcsEnumNormalization<T> {
  if (typeof input !== "string") return invalidEnum();
  const value = values.find((candidate) => equalFoldAsciiKey(candidate, input));
  if (value !== undefined) return { value };
  const fallback = values[0] as T;
  return {
    value: fallback,
    diagnostic: {
      code: "FALLBACK_DEFAULT",
      input,
      canonical: fallback,
    },
  };
}

function normalizeNumber<T extends number>(
  values: readonly T[],
  input: number,
): GcsEnumNormalization<T> {
  if (typeof input !== "number") return invalidEnum();
  const value = values.find((candidate) => candidate === input);
  if (value !== undefined) return { value };
  const fallback = values[0] as T;
  return {
    value: fallback,
    diagnostic: {
      code: "FALLBACK_DEFAULT",
      input,
      canonical: fallback,
    },
  };
}

export function parseSelfControlRoll(input: number): SelfControlRoll {
  return parseValue(SELF_CONTROL_ROLLS, input as SelfControlRoll);
}

export function normalizeSelfControlRoll(
  input: number,
): GcsEnumNormalization<SelfControlRoll> {
  return normalizeNumber(SELF_CONTROL_ROLLS, input);
}

export function parseSelfControlAdjustment(
  input: string,
): SelfControlAdjustment {
  return parseValue(SELF_CONTROL_ADJUSTMENTS, input as SelfControlAdjustment);
}

export function normalizeSelfControlAdjustment(
  input: string,
): GcsEnumNormalization<SelfControlAdjustment> {
  return normalizeString(SELF_CONTROL_ADJUSTMENTS, input);
}

export function parseFrequencyRoll(input: number): FrequencyRoll {
  return parseValue(FREQUENCY_ROLLS, input as FrequencyRoll);
}

export function normalizeFrequencyRoll(
  input: number,
): GcsEnumNormalization<FrequencyRoll> {
  return normalizeNumber(FREQUENCY_ROLLS, input);
}
