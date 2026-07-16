import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseGcsV5, serializeGcsV5 } from "@gcs/gcs-engine";
import { afterAll, describe, expect, it } from "vitest";

import { canonicalize } from "./canonicalize";
import { GcsOracleClient, type OracleResponse } from "./oracle-client";

type FixtureManifest = {
  fixtures: Array<{ file: string }>;
};

const fixturesDirectory = resolve("fixtures/gcs-v5");
const manifest = JSON.parse(
  readFileSync(resolve(fixturesDirectory, "manifest.json"), "utf8"),
) as FixtureManifest;
const oracle = new GcsOracleClient();

afterAll(async () => {
  await oracle.close();
}, 120_000);

describe("GCS v5 semantic round trip", () => {
  it.each(manifest.fixtures)(
    "preserves official normalization for $file",
    async ({ file }) => {
      const original = await readFile(resolve(fixturesDirectory, file), "utf8");
      const roundTrip = serializeGcsV5(parseGcsV5(original));

      const normalizedOriginal = await oracle.normalize(
        `${file}:original`,
        original,
      );
      const normalizedRoundTrip = await oracle.normalize(
        `${file}:round-trip`,
        roundTrip,
      );

      requireSuccess(normalizedOriginal, `${file}: original`);
      requireSuccess(normalizedRoundTrip, `${file}: round trip`);
      expect(canonicalize(normalizedRoundTrip.document)).toEqual(
        canonicalize(normalizedOriginal.document),
      );
    },
    120_000,
  );
});

function requireSuccess(
  response: OracleResponse,
  context: string,
): asserts response is Extract<OracleResponse, { ok: true }> {
  if (!response.ok) {
    throw new Error(
      `${context} rejected (${response.category}): ${response.message}`,
    );
  }
}
