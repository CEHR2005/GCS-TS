export type TraitsOracleRequest = {
  id: string;
  op: "traits.project";
  document: string;
};

export type TraitsOracleResponse =
  | { id: string; ok: true; result: Record<string, unknown> }
  | { id: string; ok: false; category: string; message: string };

export function parseTraitsOracleResponse(
  value: unknown,
): TraitsOracleResponse {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("invalid traits oracle response: id must be a string");
  }
  if (value.ok === true) {
    if (!hasExactKeys(value, ["id", "ok", "result"])) {
      throw new Error(
        `invalid traits oracle response ${value.id}: unexpected success fields`,
      );
    }
    if (!isRecord(value.result)) {
      throw new Error(
        `invalid traits oracle response ${value.id}: result must be an object`,
      );
    }
    return { id: value.id, ok: true, result: value.result };
  }
  if (value.ok === false) {
    if (!hasExactKeys(value, ["category", "id", "message", "ok"])) {
      throw new Error(
        `invalid traits oracle response ${value.id}: unexpected failure fields`,
      );
    }
    if (typeof value.category !== "string") {
      throw new Error(
        `invalid traits oracle response ${value.id}: category must be a string`,
      );
    }
    if (typeof value.message !== "string") {
      throw new Error(
        `invalid traits oracle response ${value.id}: message must be a string`,
      );
    }
    return {
      id: value.id,
      ok: false,
      category: value.category,
      message: value.message,
    };
  }
  throw new Error(
    `invalid traits oracle response ${value.id}: ok must be a boolean`,
  );
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
    actual.every((key, index) => key === expected[index])
  );
}
