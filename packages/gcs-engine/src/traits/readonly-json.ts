import {
  GCS_TRAIT_PROJECTION_MAX_DEPTH,
  GcsTraitProjectionError,
} from "./errors.js";
import type { GcsReadonlyJsonObject, GcsReadonlyJsonValue } from "./types.js";

export function appendJsonPointer(base: string, token: string): string {
  const escaped = token.replace(/~/g, "~0").replace(/\//g, "~1");
  return `${base}/${escaped}`;
}

function invalidJson(message: string, path: string): never {
  throw new GcsTraitProjectionError("INVALID_FIELD", message, path);
}

function requireNoSymbols(value: object, path: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    invalidJson("JSON objects and arrays cannot have symbol keys", path);
  }
}

function requireDataDescriptors(value: object, path: string): void {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!("value" in descriptor)) {
      invalidJson(
        "JSON objects and arrays cannot have accessor properties",
        appendJsonPointer(path, key),
      );
    }
  }
}

function cloneArray(
  value: readonly unknown[],
  path: string,
  depth: number,
  active: WeakSet<object>,
): readonly GcsReadonlyJsonValue[] {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    invalidJson("JSON arrays must have the standard Array prototype", path);
  }

  const clone: GcsReadonlyJsonValue[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = appendJsonPointer(path, String(index));
    if (!Object.hasOwn(value, index)) {
      invalidJson("JSON arrays cannot be sparse", itemPath);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !("value" in descriptor)) {
      invalidJson("JSON array entries must be data properties", itemPath);
    }
    clone.push(
      cloneReadonlyJson(descriptor.value, itemPath, depth + 1, active),
    );
  }
  return Object.freeze(clone);
}

function cloneObject(
  value: object,
  path: string,
  depth: number,
  active: WeakSet<object>,
): GcsReadonlyJsonObject {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    invalidJson("JSON objects must have a plain or null prototype", path);
  }

  const clone = Object.create(null) as Record<string, GcsReadonlyJsonValue>;
  for (const key of Object.keys(value)) {
    const propertyPath = appendJsonPointer(path, key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      invalidJson("JSON object entries must be data properties", propertyPath);
    }
    clone[key] = cloneReadonlyJson(
      descriptor.value,
      propertyPath,
      depth + 1,
      active,
    );
  }
  return Object.freeze(clone);
}

export function cloneReadonlyJson(
  value: unknown,
  path: string,
  depth: number,
  active: WeakSet<object>,
): GcsReadonlyJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      invalidJson("JSON numbers must be finite", path);
    }
    return value;
  }
  if (typeof value !== "object") {
    invalidJson("Value is not valid JSON", path);
  }
  if (depth > GCS_TRAIT_PROJECTION_MAX_DEPTH) {
    throw new GcsTraitProjectionError(
      "MAX_DEPTH_EXCEEDED",
      `JSON nesting exceeds ${GCS_TRAIT_PROJECTION_MAX_DEPTH}`,
      path,
    );
  }
  if (active.has(value)) {
    throw new GcsTraitProjectionError(
      "CYCLE_DETECTED",
      "JSON value contains an active-ancestor cycle",
      path,
    );
  }

  active.add(value);
  try {
    requireNoSymbols(value, path);
    requireDataDescriptors(value, path);
    if (Array.isArray(value)) {
      return cloneArray(value, path, depth, active);
    }
    return cloneObject(value, path, depth, active);
  } finally {
    active.delete(value);
  }
}
