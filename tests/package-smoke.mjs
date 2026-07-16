import assert from "node:assert/strict";

import {
  GCS_DATA_VERSION,
  GcsParseError,
  parseGcsV5,
  serializeGcsV5,
} from "@gcs/gcs-engine";

assert.equal(GCS_DATA_VERSION, 5);

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
