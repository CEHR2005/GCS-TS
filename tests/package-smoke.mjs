import assert from "node:assert/strict";

import {
  formatFxp,
  GCS_DATA_VERSION,
  GcsParseError,
  GcsPrimitiveError,
  fxpToRaw,
  generateTid,
  multiplyFxp,
  normalizeTraitContainerType,
  parseFxp,
  parseGcsV5,
  parseTraitContainerType,
  serializeGcsV5,
} from "@gcs/gcs-engine";

assert.equal(GCS_DATA_VERSION, 5);
assert.equal(typeof GcsPrimitiveError, "function");

const fixed = parseFxp("1.25");
assert.equal(fxpToRaw(fixed), 12_500n);
assert.equal(formatFxp(multiplyFxp(fixed, parseFxp("2"))), "2.5");
assert.equal(generateTid("t", () => new Uint8Array(12)).length, 17);
assert.equal(parseTraitContainerType("ancestry"), "ancestry");
assert.equal(
  normalizeTraitContainerType("race").diagnostic?.code,
  "LEGACY_ALIAS",
);

const document = parseGcsV5('{"version":5,"name":"Ирина"}');
assert.equal(
  serializeGcsV5(document),
  '{\n\t"version": 5,\n\t"name": "Ирина"\n}\n',
);

assert.throws(
  () => parseGcsV5('{"version":4}'),
  (error) =>
    error instanceof GcsParseError &&
    error.code === "UNSUPPORTED_VERSION" &&
    error.path === "/version",
);
