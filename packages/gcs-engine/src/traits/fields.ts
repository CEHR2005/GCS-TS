import { parseStudyType, type StudyType } from "../enums/index.js";
import { formatFxp, fxpToRaw, parseFxp, type Fxp } from "../fxp/index.js";
import { GcsPrimitiveError } from "../primitive-errors.js";
import { getTidKind, parseTid, type Tid, type TidKind } from "../tid/index.js";
import { GcsTraitProjectionError } from "./errors.js";
import { appendJsonPointer, cloneReadonlyJson } from "./readonly-json.js";
import type {
  GcsReadonlyJsonObject,
  GcsReadonlyJsonValue,
  GcsSourceV5,
  GcsStudyV5,
} from "./types.js";

const MIN_SAFE_FXP_RAW = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_FXP_RAW = BigInt(Number.MAX_SAFE_INTEGER);

export function requireRecord(
  value: unknown,
  code: "INVALID_TRAIT" | "INVALID_TRAIT_MODIFIER",
  path: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GcsTraitProjectionError(code, "Expected an object", path);
  }
  return value as Record<string, unknown>;
}

export function readRequiredNodeTid(
  record: Record<string, unknown>,
  path: string,
  allowed: readonly TidKind[],
): { readonly id: Tid; readonly kind: TidKind } {
  const idPath = appendJsonPointer(path, "id");
  if (!Object.hasOwn(record, "id") || typeof record.id !== "string") {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      "Node id must be a TID string",
      idPath,
    );
  }

  let id: Tid;
  try {
    id = parseTid(record.id);
  } catch (error) {
    if (
      error instanceof GcsPrimitiveError &&
      error.code === "INVALID_TID_KIND"
    ) {
      throw new GcsTraitProjectionError(
        "INVALID_NODE_KIND",
        error.message,
        idPath,
      );
    }
    if (error instanceof GcsPrimitiveError) {
      throw new GcsTraitProjectionError("INVALID_FIELD", error.message, idPath);
    }
    throw error;
  }

  const kind = getTidKind(id);
  if (!allowed.includes(kind)) {
    throw new GcsTraitProjectionError(
      "INVALID_NODE_KIND",
      `TID kind ${kind} is not allowed at this node`,
      idPath,
    );
  }
  return Object.freeze({ id, kind });
}

export function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "string") {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      `Field ${key} must be a string`,
      appendJsonPointer(path, key),
    );
  }
  return value;
}

export function readOptionalBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
): boolean | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      `Field ${key} must be a boolean`,
      appendJsonPointer(path, key),
    );
  }
  return value;
}

export function readOptionalFxp(
  record: Record<string, unknown>,
  key: string,
  path: string,
): Fxp | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  const fieldPath = appendJsonPointer(path, key);

  try {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("not a finite number");
    }
    const parsed = parseFxp(String(value));
    const raw = fxpToRaw(parsed);
    if (raw < MIN_SAFE_FXP_RAW || raw > MAX_SAFE_FXP_RAW) {
      throw new Error("outside the safe integer range");
    }
    if (Number(formatFxp(parsed)) !== value) {
      throw new Error("cannot be represented exactly");
    }
    return parsed;
  } catch {
    throw new GcsTraitProjectionError(
      "UNSAFE_FXP_NUMBER",
      `Field ${key} is not a safely representable fixed-point number`,
      fieldPath,
    );
  }
}

export function readOptionalEnum<Input, Output>(
  record: Record<string, unknown>,
  key: string,
  path: string,
  parser: (input: Input) => Output,
): Output | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const fieldPath = appendJsonPointer(path, key);
  try {
    return parser(record[key] as Input);
  } catch (error) {
    if (error instanceof GcsPrimitiveError) {
      throw new GcsTraitProjectionError(
        "INVALID_FIELD",
        error.message,
        fieldPath,
      );
    }
    throw error;
  }
}

export function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
): readonly string[] | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  const fieldPath = appendJsonPointer(path, key);
  if (!Array.isArray(value)) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      `Field ${key} must be an array of strings`,
      fieldPath,
    );
  }

  const clone: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = appendJsonPointer(fieldPath, String(index));
    if (!Object.hasOwn(value, index) || typeof value[index] !== "string") {
      throw new GcsTraitProjectionError(
        "INVALID_FIELD",
        `Field ${key} must contain only strings`,
        itemPath,
      );
    }
    clone.push(value[index]);
  }
  return Object.freeze(clone);
}

export function readOptionalStringMap(
  record: Record<string, unknown>,
  key: string,
  path: string,
): Readonly<Record<string, string>> | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  const fieldPath = appendJsonPointer(path, key);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      `Field ${key} must be an object of string values`,
      fieldPath,
    );
  }

  const clone = Object.create(null) as Record<string, string>;
  for (const entryKey of Object.keys(value)) {
    const entryPath = appendJsonPointer(fieldPath, entryKey);
    const descriptor = Object.getOwnPropertyDescriptor(value, entryKey);
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new GcsTraitProjectionError(
        "INVALID_FIELD",
        `Field ${key} must contain only data properties`,
        entryPath,
      );
    }
    if (typeof descriptor.value !== "string") {
      throw new GcsTraitProjectionError(
        "INVALID_FIELD",
        `Field ${key} must contain only string values`,
        entryPath,
      );
    }
    clone[entryKey] = descriptor.value;
  }
  return Object.freeze(clone);
}

export function readOptionalJsonObject(
  record: Record<string, unknown>,
  key: string,
  path: string,
  depth: number,
  active: WeakSet<object>,
): GcsReadonlyJsonObject | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const fieldPath = appendJsonPointer(path, key);
  const value = record[key];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      `Field ${key} must be a JSON object`,
      fieldPath,
    );
  }
  return cloneReadonlyJson(
    value,
    fieldPath,
    depth + 1,
    active,
  ) as GcsReadonlyJsonObject;
}

export function readOptionalJsonArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  depth: number,
  active: WeakSet<object>,
): readonly GcsReadonlyJsonValue[] | undefined {
  if (!Object.hasOwn(record, key)) return undefined;
  const fieldPath = appendJsonPointer(path, key);
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      `Field ${key} must be a JSON array`,
      fieldPath,
    );
  }
  return cloneReadonlyJson(
    value,
    fieldPath,
    depth + 1,
    active,
  ) as readonly GcsReadonlyJsonValue[];
}

function readRequiredSourceString(
  record: Record<string, unknown>,
  key: "library" | "path",
  path: string,
): string {
  const fieldPath = appendJsonPointer(path, key);
  if (!Object.hasOwn(record, key) || typeof record[key] !== "string") {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      `Source ${key} must be a string`,
      fieldPath,
    );
  }
  return record[key];
}

export function readOptionalSource(
  record: Record<string, unknown>,
  path: string,
  enclosingKind: TidKind,
): GcsSourceV5 | undefined {
  if (!Object.hasOwn(record, "source")) return undefined;
  const sourcePath = appendJsonPointer(path, "source");
  const value = record.source;
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      "Field source must be an object",
      sourcePath,
    );
  }
  const source = value as Record<string, unknown>;
  const library = readRequiredSourceString(source, "library", sourcePath);
  const sourceRecordPath = readRequiredSourceString(source, "path", sourcePath);
  const idPath = appendJsonPointer(sourcePath, "id");
  if (!Object.hasOwn(source, "id") || typeof source.id !== "string") {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      "Source id must be a TID string",
      idPath,
    );
  }

  let id: Tid;
  try {
    id = parseTid(source.id);
  } catch (error) {
    if (
      error instanceof GcsPrimitiveError &&
      error.code === "INVALID_TID_KIND"
    ) {
      throw new GcsTraitProjectionError(
        "INVALID_NODE_KIND",
        error.message,
        idPath,
      );
    }
    if (error instanceof GcsPrimitiveError) {
      throw new GcsTraitProjectionError("INVALID_FIELD", error.message, idPath);
    }
    throw error;
  }
  const kind = getTidKind(id);
  if (kind !== enclosingKind) {
    throw new GcsTraitProjectionError(
      "INVALID_NODE_KIND",
      `Source TID kind ${kind} does not match enclosing node kind ${enclosingKind}`,
      idPath,
    );
  }
  return Object.freeze({ library, path: sourceRecordPath, id });
}

function readRequiredStudyType(
  record: Record<string, unknown>,
  path: string,
): StudyType {
  if (!Object.hasOwn(record, "type")) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      "Study type is required",
      appendJsonPointer(path, "type"),
    );
  }
  return readOptionalEnum(record, "type", path, parseStudyType)!;
}

function readRequiredStudyHours(
  record: Record<string, unknown>,
  path: string,
): Fxp {
  if (!Object.hasOwn(record, "hours")) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      "Study hours are required",
      appendJsonPointer(path, "hours"),
    );
  }
  return readOptionalFxp(record, "hours", path)!;
}

export function readOptionalStudy(
  record: Record<string, unknown>,
  path: string,
): readonly GcsStudyV5[] | undefined {
  if (!Object.hasOwn(record, "study")) return undefined;
  const studyPath = appendJsonPointer(path, "study");
  const value = record.study;
  if (!Array.isArray(value)) {
    throw new GcsTraitProjectionError(
      "INVALID_FIELD",
      "Field study must be an array",
      studyPath,
    );
  }

  const clone: GcsStudyV5[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const entryPath = appendJsonPointer(studyPath, String(index));
    const entry = value[index];
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new GcsTraitProjectionError(
        "INVALID_FIELD",
        "Study entry must be an object",
        entryPath,
      );
    }
    const study = entry as Record<string, unknown>;
    const type = readRequiredStudyType(study, entryPath);
    const hours = readRequiredStudyHours(study, entryPath);
    const note = readOptionalString(study, "note", entryPath);
    clone.push(
      Object.freeze({
        type,
        hours,
        ...(note === undefined ? {} : { note }),
      }),
    );
  }
  return Object.freeze(clone);
}
