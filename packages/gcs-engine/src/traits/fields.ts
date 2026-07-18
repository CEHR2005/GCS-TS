import { GcsPrimitiveError } from "../primitive-errors.js";
import { getTidKind, parseTid, type Tid, type TidKind } from "../tid/index.js";
import { GcsTraitProjectionError } from "./errors.js";
import { appendJsonPointer } from "./readonly-json.js";

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
