import {
  fxpToRaw,
  type Fxp,
  type GcsSourceV5,
  type GcsStudyV5,
  type GcsTraitModifierNodeV5,
  type GcsTraitNodeV5,
} from "@gcs/gcs-engine";

export type ComparableJson =
  | null
  | boolean
  | number
  | string
  | readonly ComparableJson[]
  | { readonly [key: string]: ComparableJson };

type ComparableObject = { [key: string]: ComparableJson };

export function toTraitsOracleShape(
  traits: readonly GcsTraitNodeV5[] | undefined,
): ComparableObject {
  return { traits: (traits ?? []).map(toTraitShape) };
}

function toTraitShape(node: GcsTraitNodeV5): ComparableObject {
  const common: ComparableObject = {
    kind: node.kind,
    id: node.id,
    name: node.name ?? "",
    reference: node.reference ?? "",
    referenceHighlight: node.referenceHighlight ?? "",
    localNotes: node.localNotes ?? "",
    tags: node.tags ?? null,
    selfControlRoll: node.selfControlRoll ?? 0,
    selfControlAdjustment: node.selfControlAdjustment ?? "none",
    frequency: node.frequency ?? 0,
    disabled: node.disabled ?? false,
    vttNotes: node.vttNotes ?? "",
    userDescription: node.userDescription ?? "",
    replacements: node.replacements ?? null,
    modifiersPresent: node.modifiers !== undefined,
    modifiers: (node.modifiers ?? []).map(toModifierShape),
  };
  addSource(common, node.source);

  if (node.kind === "trait") {
    return {
      ...common,
      basePointsRaw: rawFxp(node.basePoints),
      pointsPerLevelRaw: rawFxp(node.pointsPerLevel),
      levelsRaw: rawFxp(node.levels),
      roundDown: node.roundDown ?? false,
      canLevel: node.canLevel ?? false,
      study: (node.study ?? []).map(toStudyShape),
      studyHoursNeeded: node.studyHoursNeeded ?? "",
      childrenPresent: false,
    };
  }

  return {
    ...common,
    ancestry: node.ancestry ?? "",
    containerType: node.containerType ?? "group",
    childrenPresent: node.children !== undefined,
    children: (node.children ?? []).map(toTraitShape),
  };
}

function toModifierShape(node: GcsTraitModifierNodeV5): ComparableObject {
  const common: ComparableObject = {
    kind: node.kind,
    id: node.id,
    name: node.name ?? "",
    reference: node.reference ?? "",
    referenceHighlight: node.referenceHighlight ?? "",
    localNotes: node.localNotes ?? "",
    tags: node.tags ?? null,
    vttNotes: node.vttNotes ?? "",
    replacements: node.replacements ?? null,
  };
  addSource(common, node.source);

  if (node.kind === "trait_modifier") {
    return {
      ...common,
      costAdjustment: node.costAdjustment ?? "",
      useLevelFromTrait: node.useLevelFromTrait ?? false,
      showNotesOnWeapon: node.showNotesOnWeapon ?? false,
      affects: node.affects ?? "total",
      levelsRaw: rawFxp(node.levels),
      disabled: node.disabled ?? false,
      childrenPresent: false,
    };
  }

  return {
    ...common,
    childrenPresent: node.children !== undefined,
    children: (node.children ?? []).map(toModifierShape),
  };
}

function toStudyShape(study: GcsStudyV5): ComparableObject {
  return {
    type: study.type,
    hoursRaw: fxpToRaw(study.hours).toString(),
    note: study.note ?? "",
  };
}

function addSource(
  target: ComparableObject,
  source: GcsSourceV5 | undefined,
): void {
  if (source === undefined) return;
  target.source = {
    library: source.library,
    path: source.path,
    id: source.id,
  };
}

function rawFxp(value: Fxp | undefined): string {
  return value === undefined ? "0" : fxpToRaw(value).toString();
}

export function sortJsonValue(value: unknown): ComparableJson {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("comparison value contains a non-finite number");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortJsonValue);
  }
  if (typeof value !== "object") {
    throw new Error(`comparison value is not JSON: ${typeof value}`);
  }

  const sorted = Object.create(null) as ComparableObject;
  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortJsonValue((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function firstJsonDifferencePointer(
  left: ComparableJson,
  right: ComparableJson,
): string | undefined {
  return findDifference(left, right, "");
}

function findDifference(
  left: ComparableJson,
  right: ComparableJson,
  path: string,
): string | undefined {
  if (Object.is(left, right)) return undefined;
  if (Array.isArray(left) && Array.isArray(right)) {
    const sharedLength = Math.min(left.length, right.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const difference = findDifference(
        left[index]!,
        right[index]!,
        `${path}/${index}`,
      );
      if (difference !== undefined) return difference;
    }
    return left.length === right.length ? undefined : `${path}/${sharedLength}`;
  }
  if (isComparableObject(left) && isComparableObject(right)) {
    const keys = [
      ...new Set([...Object.keys(left), ...Object.keys(right)]),
    ].sort();
    for (const key of keys) {
      const nextPath = `${path}/${escapeJsonPointerToken(key)}`;
      if (!(key in left) || !(key in right)) return nextPath;
      const difference = findDifference(left[key]!, right[key]!, nextPath);
      if (difference !== undefined) return difference;
    }
    return undefined;
  }
  return path;
}

function isComparableObject(
  value: ComparableJson,
): value is { readonly [key: string]: ComparableJson } {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function escapeJsonPointerToken(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}
