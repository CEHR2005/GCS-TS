import { GcsPrimitiveError } from "../primitive-errors.js";
import type { GcsEnumNormalization } from "./normalization.js";

export const TRAIT_CONTAINER_TYPES = Object.freeze([
  "group",
  "alternative_abilities",
  "ancestry",
  "attributes",
  "meta_trait",
] as const);

export type TraitContainerType = (typeof TRAIT_CONTAINER_TYPES)[number];

export const TRAIT_MODIFIER_AFFECTS_VALUES = Object.freeze([
  "total",
  "base_only",
  "levels_only",
] as const);

export type TraitModifierAffects =
  (typeof TRAIT_MODIFIER_AFFECTS_VALUES)[number];

function invalidEnum(): never {
  throw new GcsPrimitiveError("INVALID_ENUM", "Invalid enum value");
}

function requireString(input: unknown): asserts input is string {
  if (typeof input !== "string") invalidEnum();
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

function parseString<T extends string>(values: readonly T[], input: string): T {
  requireString(input);
  if ((values as readonly string[]).includes(input)) return input as T;
  return invalidEnum();
}

function normalizeString<T extends string>(
  values: readonly T[],
  input: string,
): GcsEnumNormalization<T> {
  requireString(input);
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

export function parseTraitContainerType(input: string): TraitContainerType {
  return parseString(TRAIT_CONTAINER_TYPES, input);
}

export function normalizeTraitContainerType(
  input: string,
): GcsEnumNormalization<TraitContainerType> {
  requireString(input);
  if (equalFoldAsciiKey("race", input)) {
    return {
      value: "ancestry",
      diagnostic: {
        code: "LEGACY_ALIAS",
        input,
        canonical: "ancestry",
      },
    };
  }
  return normalizeString(TRAIT_CONTAINER_TYPES, input);
}

export function parseTraitModifierAffects(input: string): TraitModifierAffects {
  return parseString(TRAIT_MODIFIER_AFFECTS_VALUES, input);
}

export function normalizeTraitModifierAffects(
  input: string,
): GcsEnumNormalization<TraitModifierAffects> {
  return normalizeString(TRAIT_MODIFIER_AFFECTS_VALUES, input);
}
