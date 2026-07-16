import type { JsonValue } from "@gcs/gcs-engine";

export type OracleErrorCategory =
  "invalid_json" | "unsupported_version" | "invalid_gcs";

export type OracleDocument = { [key: string]: JsonValue };

export type OracleResponse =
  | { id: string; ok: true; document: OracleDocument }
  | {
      id: string;
      ok: false;
      category: OracleErrorCategory;
      message: string;
    };

export function parseOracleResponse(
  value: Record<string, unknown>,
): OracleResponse | Error {
  if (typeof value.id !== "string" || typeof value.ok !== "boolean") {
    return new Error("GCS oracle response has an invalid shape");
  }
  if (value.ok) {
    if (!isJsonObject(value.document)) {
      return new Error(
        `GCS oracle success ${value.id} has an invalid document`,
      );
    }
    return { id: value.id, ok: true, document: value.document };
  }
  if (!isOracleCategory(value.category)) {
    return new Error(`GCS oracle failure ${value.id} has an invalid category`);
  }
  if (typeof value.message !== "string") {
    return new Error(`GCS oracle failure ${value.id} has an invalid shape`);
  }
  return {
    id: value.id,
    ok: false,
    category: value.category,
    message: value.message,
  };
}

function isJsonObject(value: unknown): value is OracleDocument {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  );
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonObject(value);
}

function isOracleCategory(value: unknown): value is OracleErrorCategory {
  return (
    value === "invalid_json" ||
    value === "unsupported_version" ||
    value === "invalid_gcs"
  );
}
