import { describe, expect, it } from "vitest";

import {
  FREQUENCY_ROLLS,
  normalizeFrequencyRoll,
  normalizeSelfControlAdjustment,
  normalizeSelfControlRoll,
  normalizeStudyLevel,
  normalizeStudyType,
  normalizeTraitContainerType,
  normalizeTraitModifierAffects,
  parseFrequencyRoll,
  parseSelfControlAdjustment,
  parseSelfControlRoll,
  parseStudyLevel,
  parseStudyType,
  parseTraitContainerType,
  parseTraitModifierAffects,
  SELF_CONTROL_ADJUSTMENTS,
  SELF_CONTROL_ROLLS,
  STUDY_LEVELS,
  STUDY_TYPES,
  TRAIT_CONTAINER_TYPES,
  TRAIT_MODIFIER_AFFECTS_VALUES,
} from "@gcs/gcs-engine";

describe("persisted GCS enum tables", () => {
  it("exports every selected domain in pinned order", () => {
    expect(TRAIT_CONTAINER_TYPES).toEqual([
      "group",
      "alternative_abilities",
      "ancestry",
      "attributes",
      "meta_trait",
    ]);
    expect(TRAIT_MODIFIER_AFFECTS_VALUES).toEqual([
      "total",
      "base_only",
      "levels_only",
    ]);
    expect(SELF_CONTROL_ROLLS).toEqual([
      0, 1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(SELF_CONTROL_ADJUSTMENTS).toEqual([
      "none",
      "action_penalty",
      "reaction_penalty",
      "fright_check_penalty",
      "fright_check_bonus",
      "minor_cost_of_living_increase",
      "major_cost_of_living_increase",
    ]);
    expect(FREQUENCY_ROLLS).toEqual([0, 6, 9, 12, 15, 18]);
    expect(STUDY_LEVELS).toEqual(["", "180", "160", "140", "120"]);
    expect(STUDY_TYPES).toEqual(["self", "job", "teacher", "intensive"]);
  });

  it.each([
    ["trait container", TRAIT_CONTAINER_TYPES],
    ["trait modifier affects", TRAIT_MODIFIER_AFFECTS_VALUES],
    ["self-control roll", SELF_CONTROL_ROLLS],
    ["self-control adjustment", SELF_CONTROL_ADJUSTMENTS],
    ["frequency roll", FREQUENCY_ROLLS],
    ["study level", STUDY_LEVELS],
    ["study type", STUDY_TYPES],
  ] as const)("exports a runtime-frozen %s table", (_name, values) => {
    expect(Object.isFrozen(values)).toBe(true);
    expect(Reflect.set(values, "0", "mutated")).toBe(false);
  });
});

describe("strict persisted enum parsers", () => {
  it.each([
    [TRAIT_CONTAINER_TYPES, parseTraitContainerType],
    [TRAIT_MODIFIER_AFFECTS_VALUES, parseTraitModifierAffects],
    [SELF_CONTROL_ADJUSTMENTS, parseSelfControlAdjustment],
    [STUDY_LEVELS, parseStudyLevel],
    [STUDY_TYPES, parseStudyType],
  ] as const)("accepts every exact canonical string in %j", (values, parse) => {
    for (const value of values) expect(parse(value)).toBe(value);
  });

  it.each([
    [SELF_CONTROL_ROLLS, parseSelfControlRoll],
    [FREQUENCY_ROLLS, parseFrequencyRoll],
  ] as const)("accepts every exact canonical number in %j", (values, parse) => {
    for (const value of values) expect(parse(value)).toBe(value);
  });

  it.each([
    () => parseTraitContainerType("GROUP"),
    () => parseTraitContainerType("race"),
    () => parseTraitModifierAffects("TOTAL"),
    () => parseSelfControlAdjustment("NONE"),
    () => parseStudyLevel("unknown"),
    () => parseStudyType("SELF"),
    () => parseSelfControlRoll(2),
    () => parseFrequencyRoll(5),
  ])("rejects non-canonical strict input with INVALID_ENUM", (parse) => {
    expect(parse).toThrowError(
      expect.objectContaining({ code: "INVALID_ENUM" }),
    );
  });
});

describe("GCS-compatible persisted enum normalization", () => {
  it("normalizes canonical case without a diagnostic", () => {
    expect(normalizeTraitContainerType("AnCeStRy")).toEqual({
      value: "ancestry",
    });
  });

  it.each([
    [normalizeTraitContainerType, "anceſtry", "ancestry"],
    [normalizeStudyType, "intenſive", "intensive"],
  ] as const)(
    "matches Go EqualFold for ASCII persisted keys",
    (normalize, input, value) => {
      expect(normalize(input)).toEqual({ value });
    },
  );

  it("does not apply broad Unicode compatibility normalization", () => {
    expect(normalizeTraitContainerType("ａｎｃｅｓｔｒｙ")).toEqual({
      value: "group",
      diagnostic: {
        code: "FALLBACK_DEFAULT",
        input: "ａｎｃｅｓｔｒｙ",
        canonical: "group",
      },
    });
  });

  it("surfaces the legacy race alias", () => {
    expect(normalizeTraitContainerType("RaCe")).toEqual({
      value: "ancestry",
      diagnostic: {
        code: "LEGACY_ALIAS",
        input: "RaCe",
        canonical: "ancestry",
      },
    });
  });

  it.each([
    [normalizeTraitContainerType, "unknown", "group"],
    [normalizeTraitModifierAffects, "unknown", "total"],
    [normalizeSelfControlAdjustment, "unknown", "none"],
    [normalizeStudyLevel, "unknown", ""],
    [normalizeStudyType, "unknown", "self"],
  ] as const)(
    "makes string fallback repair visible",
    (normalize, input, value) => {
      expect(normalize(input)).toEqual({
        value,
        diagnostic: { code: "FALLBACK_DEFAULT", input, canonical: value },
      });
    },
  );

  it.each([
    [normalizeTraitModifierAffects, "LeVeLs_OnLy", "levels_only"],
    [
      normalizeSelfControlAdjustment,
      "FrIgHt_ChEcK_BoNuS",
      "fright_check_bonus",
    ],
    [normalizeStudyLevel, "180", "180"],
    [normalizeStudyType, "TeAcHeR", "teacher"],
  ] as const)(
    "normalizes string canonical input case-insensitively",
    (normalize, input, value) => {
      expect(normalize(input)).toEqual({ value });
    },
  );

  it.each([
    [normalizeSelfControlRoll, 2],
    [normalizeFrequencyRoll, 5],
  ] as const)("makes numeric fallback repair visible", (normalize, input) => {
    expect(normalize(input)).toEqual({
      value: 0,
      diagnostic: { code: "FALLBACK_DEFAULT", input, canonical: 0 },
    });
  });
});

describe("malformed runtime enum inputs", () => {
  const stringFunctions = [
    ["parseTraitContainerType", parseTraitContainerType],
    ["normalizeTraitContainerType", normalizeTraitContainerType],
    ["parseTraitModifierAffects", parseTraitModifierAffects],
    ["normalizeTraitModifierAffects", normalizeTraitModifierAffects],
    ["parseSelfControlAdjustment", parseSelfControlAdjustment],
    ["normalizeSelfControlAdjustment", normalizeSelfControlAdjustment],
    ["parseStudyLevel", parseStudyLevel],
    ["normalizeStudyLevel", normalizeStudyLevel],
    ["parseStudyType", parseStudyType],
    ["normalizeStudyType", normalizeStudyType],
  ] as const;
  const numericFunctions = [
    ["parseSelfControlRoll", parseSelfControlRoll],
    ["normalizeSelfControlRoll", normalizeSelfControlRoll],
    ["parseFrequencyRoll", parseFrequencyRoll],
    ["normalizeFrequencyRoll", normalizeFrequencyRoll],
  ] as const;

  it.each(stringFunctions)(
    "%s rejects non-string runtime input",
    (_name, fn) => {
      for (const input of [null, undefined, {}, Symbol("invalid")]) {
        expect(() =>
          (fn as unknown as (value: unknown) => unknown)(input),
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENUM" }));
      }
    },
  );

  it.each(numericFunctions)(
    "%s rejects non-number runtime input",
    (_name, fn) => {
      for (const input of [null, undefined, {}, Symbol("invalid")]) {
        expect(() =>
          (fn as unknown as (value: unknown) => unknown)(input),
        ).toThrowError(expect.objectContaining({ code: "INVALID_ENUM" }));
      }
    },
  );
});
