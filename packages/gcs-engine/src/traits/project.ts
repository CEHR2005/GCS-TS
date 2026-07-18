import type { TidKind } from "../tid/index.js";
import type { GcsDocumentV5 } from "../types.js";
import {
  GCS_TRAIT_PROJECTION_MAX_DEPTH,
  GcsTraitProjectionError,
} from "./errors.js";
import { readRequiredNodeTid, requireRecord } from "./fields.js";
import { appendJsonPointer } from "./readonly-json.js";
import type { GcsTraitModifierNodeV5, GcsTraitNodeV5 } from "./types.js";

const TRAIT_KINDS = Object.freeze(["t", "T"] as const satisfies TidKind[]);
const MODIFIER_KINDS = Object.freeze(["m", "M"] as const satisfies TidKind[]);

const TRAIT_LEAF_ONLY_FIELDS = Object.freeze([
  "base_points",
  "points_per_level",
  "levels",
  "round_down",
  "can_level",
  "study",
  "study_hours_needed",
  "features",
  "weapons",
] as const);

const TRAIT_CONTAINER_ONLY_FIELDS = Object.freeze([
  "ancestry",
  "template_picker",
  "container_type",
  "children",
] as const);

const MODIFIER_LEAF_ONLY_FIELDS = Object.freeze([
  "cost_adj",
  "use_level_from_trait",
  "show_notes_on_weapon",
  "affects",
  "features",
  "levels",
  "disabled",
] as const);

function invalidField(message: string, path: string): never {
  throw new GcsTraitProjectionError("INVALID_FIELD", message, path);
}

function requireDepth(path: string, depth: number): void {
  if (depth > GCS_TRAIT_PROJECTION_MAX_DEPTH) {
    throw new GcsTraitProjectionError(
      "MAX_DEPTH_EXCEEDED",
      `Trait nesting exceeds ${GCS_TRAIT_PROJECTION_MAX_DEPTH}`,
      path,
    );
  }
}

function requireNotActive(
  record: Record<string, unknown>,
  path: string,
  active: WeakSet<object>,
): void {
  if (active.has(record)) {
    throw new GcsTraitProjectionError(
      "CYCLE_DETECTED",
      "Trait tree contains an active-ancestor cycle",
      path,
    );
  }
}

function rejectPresentFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  path: string,
): void {
  for (const field of fields) {
    if (Object.hasOwn(record, field)) {
      throw new GcsTraitProjectionError(
        "INVALID_CONTAINER_SHAPE",
        `Field ${field} is not allowed for this node kind`,
        appendJsonPointer(path, field),
      );
    }
  }
}

function projectTraitArray(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
): readonly GcsTraitNodeV5[] {
  if (!Array.isArray(value)) {
    invalidField("Trait children must be an array", path);
  }

  const projected: GcsTraitNodeV5[] = [];
  for (let index = 0; index < value.length; index += 1) {
    projected.push(
      projectTraitNode(
        value[index],
        appendJsonPointer(path, String(index)),
        depth,
        active,
      ),
    );
  }
  return Object.freeze(projected);
}

function projectModifierArray(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
): readonly GcsTraitModifierNodeV5[] {
  if (!Array.isArray(value)) {
    invalidField("Trait modifiers must be an array", path);
  }

  const projected: GcsTraitModifierNodeV5[] = [];
  for (let index = 0; index < value.length; index += 1) {
    projected.push(
      projectModifierNode(
        value[index],
        appendJsonPointer(path, String(index)),
        depth,
        active,
      ),
    );
  }
  return Object.freeze(projected);
}

function projectOptionalModifiers(
  record: Record<string, unknown>,
  path: string,
  depth: number,
  active: WeakSet<object>,
): readonly GcsTraitModifierNodeV5[] | undefined {
  if (!Object.hasOwn(record, "modifiers")) return undefined;
  const fieldPath = appendJsonPointer(path, "modifiers");
  return projectModifierArray(record.modifiers, fieldPath, depth + 1, active);
}

function projectTraitNode(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
): GcsTraitNodeV5 {
  requireDepth(path, depth);
  const record = requireRecord(value, "INVALID_TRAIT", path);
  requireNotActive(record, path, active);
  active.add(record);
  try {
    const { id, kind } = readRequiredNodeTid(record, path, TRAIT_KINDS);
    const modifiers = projectOptionalModifiers(record, path, depth, active);

    if (kind === "t") {
      rejectPresentFields(record, TRAIT_CONTAINER_ONLY_FIELDS, path);
      return Object.freeze({
        kind: "trait" as const,
        id,
        ...(modifiers === undefined ? {} : { modifiers }),
      });
    }

    rejectPresentFields(record, TRAIT_LEAF_ONLY_FIELDS, path);
    const children = Object.hasOwn(record, "children")
      ? projectTraitArray(
          record.children,
          appendJsonPointer(path, "children"),
          depth + 1,
          active,
        )
      : undefined;
    return Object.freeze({
      kind: "trait_container" as const,
      id,
      ...(modifiers === undefined ? {} : { modifiers }),
      ...(children === undefined ? {} : { children }),
    });
  } finally {
    active.delete(record);
  }
}

function projectModifierNode(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
): GcsTraitModifierNodeV5 {
  requireDepth(path, depth);
  const record = requireRecord(value, "INVALID_TRAIT_MODIFIER", path);
  requireNotActive(record, path, active);
  active.add(record);
  try {
    const { id, kind } = readRequiredNodeTid(record, path, MODIFIER_KINDS);
    if (kind === "m") {
      rejectPresentFields(record, ["children"], path);
      return Object.freeze({ kind: "trait_modifier" as const, id });
    }

    rejectPresentFields(record, MODIFIER_LEAF_ONLY_FIELDS, path);
    const children = Object.hasOwn(record, "children")
      ? projectModifierArray(
          record.children,
          appendJsonPointer(path, "children"),
          depth + 1,
          active,
        )
      : undefined;
    return Object.freeze({
      kind: "trait_modifier_container" as const,
      id,
      ...(children === undefined ? {} : { children }),
    });
  } finally {
    active.delete(record);
  }
}

export function projectGcsTraitsV5(
  document: GcsDocumentV5,
): readonly GcsTraitNodeV5[] | undefined {
  if (!Object.hasOwn(document, "traits")) return undefined;
  if (!Array.isArray(document.traits)) {
    throw new GcsTraitProjectionError(
      "INVALID_TRAITS",
      "Document traits must be an array",
      "/traits",
    );
  }

  return projectTraitArray(document.traits, "/traits", 1, new WeakSet());
}
