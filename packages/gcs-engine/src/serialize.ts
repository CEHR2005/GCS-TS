import type { GcsDocumentV5 } from "./types.js";
import { assertGcsDocumentV5 } from "./validate.js";

export function serializeGcsV5(document: GcsDocumentV5): string {
  assertGcsDocumentV5(document);
  return `${JSON.stringify(document, null, "\t")}\n`;
}
