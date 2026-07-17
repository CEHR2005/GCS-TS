import {
  FREQUENCY_ROLLS,
  normalizeFrequencyRoll,
  normalizeSelfControlAdjustment,
  normalizeSelfControlRoll,
  normalizeStudyLevel,
  normalizeStudyType,
  normalizeTraitContainerType,
  normalizeTraitModifierAffects,
  SELF_CONTROL_ADJUSTMENTS,
  SELF_CONTROL_ROLLS,
  STUDY_LEVELS,
  STUDY_TYPES,
  TRAIT_CONTAINER_TYPES,
  TRAIT_MODIFIER_AFFECTS_VALUES,
  type GcsEnumNormalization,
} from "@gcs/gcs-engine";
import { describe, expect, it } from "vitest";

import type { PrimitiveOracleResponse } from "./oracle-protocol";
import { runPrimitiveOracle } from "./oracle-runner";

const tables = {
  trait_container: TRAIT_CONTAINER_TYPES,
  trait_modifier_affects: TRAIT_MODIFIER_AFFECTS_VALUES,
  self_control_roll: SELF_CONTROL_ROLLS,
  self_control_adjustment: SELF_CONTROL_ADJUSTMENTS,
  frequency_roll: FREQUENCY_ROLLS,
  study_level: STUDY_LEVELS,
  study_type: STUDY_TYPES,
} as const;

type Normalization = GcsEnumNormalization<string | number>;
type EnumCase = {
  domain: keyof typeof tables;
  input: string | number;
  ts: Normalization;
  expectedDiagnostic?: "LEGACY_ALIAS" | "FALLBACK_DEFAULT";
};

describe("persisted enum conformance with GCS v5.44.0", () => {
  it("matches all seven canonical tables and their ordering", () => {
    const entries = Object.entries(tables) as [
      keyof typeof tables,
      readonly (string | number)[],
    ][];
    const responses = runPrimitiveOracle(
      entries.map(([domain], index) => ({
        id: `table-${index}`,
        op: "enum.table",
        args: { domain },
      })),
    );
    entries.forEach(([domain, values], index) => {
      const response = requireSuccess(responses[index], `table ${domain}`);
      expect(response.result.values, `enum table mismatch: ${domain}`).toEqual(
        values,
      );
    });
  }, 30_000);

  it("matches canonical, uppercase, legacy, and fallback normalization", () => {
    const cases: EnumCase[] = [];
    addStringCases(
      cases,
      "trait_container",
      TRAIT_CONTAINER_TYPES,
      normalizeTraitContainerType,
    );
    addStringCases(
      cases,
      "trait_modifier_affects",
      TRAIT_MODIFIER_AFFECTS_VALUES,
      normalizeTraitModifierAffects,
    );
    addNumberCases(
      cases,
      "self_control_roll",
      SELF_CONTROL_ROLLS,
      normalizeSelfControlRoll,
    );
    addStringCases(
      cases,
      "self_control_adjustment",
      SELF_CONTROL_ADJUSTMENTS,
      normalizeSelfControlAdjustment,
    );
    addNumberCases(
      cases,
      "frequency_roll",
      FREQUENCY_ROLLS,
      normalizeFrequencyRoll,
    );
    addStringCases(cases, "study_level", STUDY_LEVELS, normalizeStudyLevel);
    addStringCases(cases, "study_type", STUDY_TYPES, normalizeStudyType);
    cases.push({
      domain: "trait_container",
      input: "race",
      ts: normalizeTraitContainerType("race"),
      expectedDiagnostic: "LEGACY_ALIAS",
    });

    const responses = runPrimitiveOracle(
      cases.map(({ domain, input }, index) => ({
        id: `normalize-${index}`,
        op: "enum.normalize",
        args: { domain, input },
      })),
    );
    cases.forEach((testCase, index) => {
      const response = requireSuccess(
        responses[index],
        `normalize ${testCase.domain}`,
      );
      expect(
        testCase.ts.value,
        `enum value mismatch domain=${testCase.domain} input=${JSON.stringify(testCase.input)}`,
      ).toBe(response.result.value);
      expect(
        testCase.ts.diagnostic?.code,
        `enum diagnostic mismatch domain=${testCase.domain} input=${JSON.stringify(testCase.input)}`,
      ).toBe(testCase.expectedDiagnostic);
    });
  }, 30_000);
});

function addStringCases<T extends string>(
  cases: EnumCase[],
  domain: EnumCase["domain"],
  values: readonly T[],
  normalize: (input: string) => GcsEnumNormalization<T>,
): void {
  for (const value of values) {
    cases.push({ domain, input: value, ts: normalize(value) });
    cases.push({
      domain,
      input: value.toUpperCase(),
      ts: normalize(value.toUpperCase()),
    });
  }
  const unknown = "not_a_gcs_value";
  cases.push({
    domain,
    input: unknown,
    ts: normalize(unknown),
    expectedDiagnostic: "FALLBACK_DEFAULT",
  });
}

function addNumberCases<T extends number>(
  cases: EnumCase[],
  domain: EnumCase["domain"],
  values: readonly T[],
  normalize: (input: number) => GcsEnumNormalization<T>,
): void {
  for (const value of values) {
    cases.push({ domain, input: value, ts: normalize(value) });
  }
  for (const unknown of [2, 5, 16, 255]) {
    cases.push({
      domain,
      input: unknown,
      ts: normalize(unknown),
      expectedDiagnostic: "FALLBACK_DEFAULT",
    });
  }
}

function requireSuccess(
  response: PrimitiveOracleResponse | undefined,
  context: string,
): Extract<PrimitiveOracleResponse, { ok: true }> {
  if (response === undefined || !response.ok) {
    throw new Error(`oracle ${context} failed: ${JSON.stringify(response)}`);
  }
  return response;
}
