import {
  parseFrequencyRoll,
  parseSelfControlAdjustment,
  parseSelfControlRoll,
  parseStudyLevel,
  parseTraitContainerType,
  parseTraitModifierAffects,
} from "../enums/index.js";
import type { TidKind } from "../tid/index.js";
import type { GcsDocumentV5 } from "../types.js";
import {
  GCS_TRAIT_PROJECTION_MAX_DEPTH,
  GcsTraitProjectionError,
} from "./errors.js";
import {
  readOptionalBoolean,
  readOptionalEnum,
  readOptionalFxp,
  readOptionalJsonArray,
  readOptionalJsonObject,
  readOptionalSource,
  readOptionalString,
  readOptionalStringArray,
  readOptionalStringMap,
  readOptionalStudy,
  readRequiredNodeTid,
  requireRecord,
} from "./fields.js";
import { appendJsonPointer } from "./readonly-json.js";
import type {
  GcsTraitCommonV5,
  GcsTraitContainerV5,
  GcsTraitModifierCommonV5,
  GcsTraitModifierContainerV5,
  GcsTraitModifierNodeV5,
  GcsTraitModifierV5,
  GcsTraitNodeV5,
  GcsTraitV5,
} from "./types.js";

type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };

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

function assignOptional<T, Key extends keyof T>(
  builder: Mutable<T>,
  key: Key,
  value: T[Key] | undefined,
): void {
  if (value !== undefined) {
    builder[key] = value;
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

function projectTraitCommon(
  record: Record<string, unknown>,
  path: string,
  depth: number,
  active: WeakSet<object>,
  id: GcsTraitCommonV5["id"],
  kind: TidKind,
  modifiers: readonly GcsTraitModifierNodeV5[] | undefined,
): Mutable<GcsTraitCommonV5> {
  const builder: Mutable<GcsTraitCommonV5> = { id };
  const string = (key: string) => readOptionalString(record, key, path);
  const jsonObject = (key: string) =>
    readOptionalJsonObject(record, key, path, depth, active);
  assignOptional(builder, "source", readOptionalSource(record, path, kind));
  assignOptional(builder, "name", string("name"));
  assignOptional(builder, "reference", string("reference"));
  assignOptional(builder, "referenceHighlight", string("reference_highlight"));
  assignOptional(builder, "localNotes", string("local_notes"));
  assignOptional(
    builder,
    "tags",
    readOptionalStringArray(record, "tags", path),
  );
  assignOptional(builder, "prerequisites", jsonObject("prereqs"));
  assignOptional(
    builder,
    "selfControlRoll",
    readOptionalEnum(record, "cr", path, parseSelfControlRoll),
  );
  assignOptional(
    builder,
    "selfControlAdjustment",
    readOptionalEnum(record, "cr_adj", path, parseSelfControlAdjustment),
  );
  assignOptional(
    builder,
    "frequency",
    readOptionalEnum(record, "frequency", path, parseFrequencyRoll),
  );
  assignOptional(
    builder,
    "disabled",
    readOptionalBoolean(record, "disabled", path),
  );
  assignOptional(builder, "vttNotes", string("vtt_notes"));
  assignOptional(builder, "userDescription", string("userdesc"));
  assignOptional(
    builder,
    "replacements",
    readOptionalStringMap(record, "replacements", path),
  );
  assignOptional(builder, "modifiers", modifiers);
  assignOptional(builder, "thirdParty", jsonObject("third_party"));
  assignOptional(builder, "calc", jsonObject("calc"));
  return builder;
}

function projectModifierCommon(
  record: Record<string, unknown>,
  path: string,
  depth: number,
  active: WeakSet<object>,
  id: GcsTraitModifierCommonV5["id"],
  kind: TidKind,
): Mutable<GcsTraitModifierCommonV5> {
  const builder: Mutable<GcsTraitModifierCommonV5> = { id };
  const string = (key: string) => readOptionalString(record, key, path);
  const jsonObject = (key: string) =>
    readOptionalJsonObject(record, key, path, depth, active);
  assignOptional(builder, "source", readOptionalSource(record, path, kind));
  assignOptional(builder, "name", string("name"));
  assignOptional(builder, "reference", string("reference"));
  assignOptional(builder, "referenceHighlight", string("reference_highlight"));
  assignOptional(builder, "localNotes", string("local_notes"));
  assignOptional(
    builder,
    "tags",
    readOptionalStringArray(record, "tags", path),
  );
  assignOptional(builder, "vttNotes", string("vtt_notes"));
  assignOptional(
    builder,
    "replacements",
    readOptionalStringMap(record, "replacements", path),
  );
  assignOptional(builder, "thirdParty", jsonObject("third_party"));
  assignOptional(builder, "calc", jsonObject("calc"));
  return builder;
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
      const fxp = (key: string) => readOptionalFxp(record, key, path);
      const boolean = (key: string) => readOptionalBoolean(record, key, path);
      const jsonArray = (key: string) =>
        readOptionalJsonArray(record, key, path, depth, active);
      const builder: Mutable<GcsTraitV5> = {
        kind: "trait",
        ...projectTraitCommon(record, path, depth, active, id, kind, modifiers),
      };
      assignOptional(builder, "basePoints", fxp("base_points"));
      assignOptional(builder, "pointsPerLevel", fxp("points_per_level"));
      assignOptional(builder, "levels", fxp("levels"));
      assignOptional(builder, "roundDown", boolean("round_down"));
      assignOptional(builder, "canLevel", boolean("can_level"));
      assignOptional(builder, "study", readOptionalStudy(record, path));
      assignOptional(
        builder,
        "studyHoursNeeded",
        readOptionalEnum(record, "study_hours_needed", path, parseStudyLevel),
      );
      assignOptional(builder, "features", jsonArray("features"));
      assignOptional(builder, "weapons", jsonArray("weapons"));
      return Object.freeze(builder);
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
    const builder: Mutable<GcsTraitContainerV5> = {
      kind: "trait_container",
      ...projectTraitCommon(record, path, depth, active, id, kind, modifiers),
    };
    assignOptional(
      builder,
      "ancestry",
      readOptionalString(record, "ancestry", path),
    );
    assignOptional(
      builder,
      "templatePicker",
      readOptionalJsonObject(record, "template_picker", path, depth, active),
    );
    assignOptional(
      builder,
      "containerType",
      readOptionalEnum(record, "container_type", path, parseTraitContainerType),
    );
    assignOptional(builder, "children", children);
    return Object.freeze(builder);
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
      const boolean = (key: string) => readOptionalBoolean(record, key, path);
      const builder: Mutable<GcsTraitModifierV5> = {
        kind: "trait_modifier",
        ...projectModifierCommon(record, path, depth, active, id, kind),
      };
      assignOptional(
        builder,
        "costAdjustment",
        readOptionalString(record, "cost_adj", path),
      );
      assignOptional(
        builder,
        "useLevelFromTrait",
        boolean("use_level_from_trait"),
      );
      assignOptional(
        builder,
        "showNotesOnWeapon",
        boolean("show_notes_on_weapon"),
      );
      assignOptional(
        builder,
        "affects",
        readOptionalEnum(record, "affects", path, parseTraitModifierAffects),
      );
      assignOptional(
        builder,
        "features",
        readOptionalJsonArray(record, "features", path, depth, active),
      );
      assignOptional(
        builder,
        "levels",
        readOptionalFxp(record, "levels", path),
      );
      assignOptional(builder, "disabled", boolean("disabled"));
      return Object.freeze(builder);
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
    const builder: Mutable<GcsTraitModifierContainerV5> = {
      kind: "trait_modifier_container",
      ...projectModifierCommon(record, path, depth, active, id, kind),
    };
    assignOptional(builder, "children", children);
    return Object.freeze(builder);
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
