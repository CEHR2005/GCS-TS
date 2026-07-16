import { GcsParseError } from "./errors.js";
import { GCS_DATA_VERSION, type GcsDocumentV5 } from "./types.js";

function hasOwnVersion(value: object): value is { version: unknown } {
  return Object.hasOwn(value, "version");
}

export function assertGcsDocumentV5(
  value: unknown,
): asserts value is GcsDocumentV5 {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new GcsParseError(
      "ROOT_NOT_OBJECT",
      "The GCS document root must be an object",
    );
  }

  if (!hasOwnVersion(value)) {
    throw new GcsParseError(
      "MISSING_VERSION",
      "The GCS document must contain a version",
      "/version",
    );
  }

  if (value.version !== GCS_DATA_VERSION) {
    throw new GcsParseError(
      "UNSUPPORTED_VERSION",
      `Expected GCS data version ${GCS_DATA_VERSION}`,
      "/version",
    );
  }
}
