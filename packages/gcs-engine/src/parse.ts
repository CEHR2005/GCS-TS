import { GcsParseError } from "./errors.js";
import type { GcsDocumentV5 } from "./types.js";
import { assertGcsDocumentV5 } from "./validate.js";

function decodeInput(input: string | Uint8Array): string {
  if (typeof input === "string") {
    return input;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(input);
  } catch {
    throw new GcsParseError("INVALID_UTF8", "Input is not valid UTF-8");
  }
}

export function parseGcsV5(input: string | Uint8Array): GcsDocumentV5 {
  const source = decodeInput(input);
  let value: unknown;

  try {
    value = JSON.parse(source) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new GcsParseError("INVALID_JSON", "Input is not valid JSON");
    }

    throw error;
  }

  assertGcsDocumentV5(value);
  return value;
}
