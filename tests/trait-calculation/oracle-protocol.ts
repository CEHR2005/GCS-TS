export type TraitCalculationOracleRequest = {
  id: string;
  op: "traits.calculate";
  document: string;
  use_multiplicative_modifiers: boolean;
};

export type TraitCalculationOracleResponse = {
  id: string;
  ok: true;
  result: Record<string, unknown>;
};

export function parseTraitCalculationOracleResponse(
  value: unknown,
): TraitCalculationOracleResponse {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error(
      "invalid trait calculation oracle response: id must be a string",
    );
  }
  if (!hasExactKeys(value, ["id", "ok", "result"]) || value.ok !== true) {
    throw new Error(
      `invalid trait calculation oracle response ${value.id}: unexpected fields`,
    );
  }
  if (!isRecord(value.result)) {
    throw new Error(
      `invalid trait calculation oracle response ${value.id}: result must be an object`,
    );
  }
  return { id: value.id, ok: true, result: value.result };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, i) => key === expected[i])
  );
}
