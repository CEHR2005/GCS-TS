import { GcsPrimitiveError } from "../primitive-errors.js";
import type { GcsEnumNormalization } from "./normalization.js";

export const STUDY_LEVELS = Object.freeze([
  "",
  "180",
  "160",
  "140",
  "120",
] as const);

export type StudyLevel = (typeof STUDY_LEVELS)[number];

export const STUDY_TYPES = Object.freeze([
  "self",
  "job",
  "teacher",
  "intensive",
] as const);

export type StudyType = (typeof STUDY_TYPES)[number];

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

export function parseStudyLevel(input: string): StudyLevel {
  return parseString(STUDY_LEVELS, input);
}

export function normalizeStudyLevel(
  input: string,
): GcsEnumNormalization<StudyLevel> {
  return normalizeString(STUDY_LEVELS, input);
}

export function parseStudyType(input: string): StudyType {
  return parseString(STUDY_TYPES, input);
}

export function normalizeStudyType(
  input: string,
): GcsEnumNormalization<StudyType> {
  return normalizeString(STUDY_TYPES, input);
}
