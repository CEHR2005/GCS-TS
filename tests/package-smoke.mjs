import assert from "node:assert/strict";

import {
  calculateGcsTraitPointsV5,
  formatFxp,
  GCS_DATA_VERSION,
  GCS_TRAIT_PROJECTION_MAX_DEPTH,
  GcsParseError,
  GcsPrimitiveError,
  GcsTraitProjectionError,
  GcsTraitCalculationError,
  fxpToRaw,
  generateTid,
  multiplyFxp,
  normalizeTraitContainerType,
  parseFxp,
  parseGcsV5,
  parseTraitContainerType,
  projectGcsTraitsV5,
  serializeGcsV5,
} from "@gcs/gcs-engine";

assert.equal(GCS_DATA_VERSION, 5);
assert.equal(typeof GcsPrimitiveError, "function");
assert.equal(GCS_TRAIT_PROJECTION_MAX_DEPTH, 256);
assert.equal(typeof GcsTraitProjectionError, "function");
assert.equal(typeof GcsTraitCalculationError, "function");

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

const traitId = "tAAECAwQFBgcICQoL";
const traitDocument = parseGcsV5(
  `{"version":5,"traits":[{"id":"${traitId}","base_points":1.25}]}`,
);
const projectedTraits = projectGcsTraitsV5(traitDocument);
assert.equal(projectedTraits?.[0]?.kind, "trait");
assert.equal(projectedTraits?.[0]?.id, traitId);
assert.equal(fxpToRaw(projectedTraits?.[0]?.basePoints), 12_500n);

const calculatedTraits = calculateGcsTraitPointsV5(
  [
    {
      kind: "trait_container",
      id: "TAAECAwQFBgcICQoL",
      children: [
        {
          kind: "trait",
          id: traitId,
          basePoints: parseFxp("1"),
          pointsPerLevel: parseFxp("2"),
          levels: parseFxp("2"),
          canLevel: true,
        },
      ],
    },
  ],
  { useMultiplicativeModifiers: false },
);
assert.equal(fxpToRaw(calculatedTraits?.[0]?.adjustedPoints), 50_000n);
assert.equal(Object.isFrozen(calculatedTraits), true);
assert.equal(Object.isFrozen(calculatedTraits?.[0]), true);
assert.equal(Object.isFrozen(calculatedTraits?.[0]?.children), true);
assert.throws(
  () => calculateGcsTraitPointsV5([], {}),
  (error) =>
    error instanceof GcsTraitCalculationError &&
    error.code === "INVALID_OPTIONS" &&
    error.path === "/options/useMultiplicativeModifiers",
);

const packageJson = JSON.parse(
  await import("node:fs/promises").then(({ readFile }) =>
    readFile(new URL("../packages/gcs-engine/package.json", import.meta.url)),
  ),
);
assert.equal("dependencies" in packageJson, false);

assert.throws(
  () => parseGcsV5('{"version":4}'),
  (error) =>
    error instanceof GcsParseError &&
    error.code === "UNSUPPORTED_VERSION" &&
    error.path === "/version",
);
