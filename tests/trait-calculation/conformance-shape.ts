import { fxpFromRaw, type GcsTraitCalculationNodeV5 } from "@gcs/gcs-engine";

export function fromOracleCalculationResult(
  value: Record<string, unknown>,
): readonly GcsTraitCalculationNodeV5[] {
  if (!hasExactKeys(value, ["traits"]) || !Array.isArray(value.traits))
    throw new Error("invalid calculation result");
  return value.traits.map(fromOracleNode);
}

function fromOracleNode(value: unknown): GcsTraitCalculationNodeV5 {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.adjustedPoints !== "string"
  )
    throw new Error("invalid calculation node");
  const adjustedPoints = raw(value.adjustedPoints);
  if (
    value.kind === "trait" &&
    hasExactKeys(value, ["adjustedPoints", "currentLevel", "id", "kind"]) &&
    typeof value.currentLevel === "string"
  ) {
    return Object.freeze({
      kind: "trait",
      id: value.id as never,
      currentLevel: raw(value.currentLevel),
      adjustedPoints,
    });
  }
  const keys =
    value.children === undefined
      ? ["adjustedPoints", "id", "kind"]
      : ["adjustedPoints", "children", "id", "kind"];
  if (
    value.kind !== "trait_container" ||
    !hasExactKeys(value, keys) ||
    (value.children !== undefined && !Array.isArray(value.children))
  )
    throw new Error("invalid calculation container");
  return Object.freeze({
    kind: "trait_container",
    id: value.id as never,
    adjustedPoints,
    ...(value.children === undefined
      ? {}
      : { children: Object.freeze(value.children.map(fromOracleNode)) }),
  });
}

function raw(value: string) {
  if (!/^-?\d+$/u.test(value)) throw new Error("invalid raw Fxp");
  return fxpFromRaw(BigInt(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, i) => key === expected[i])
  );
}
