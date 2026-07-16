import { readFile, readdir } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import { parseGcsV5, serializeGcsV5 } from "@gcs/gcs-engine";
import { afterAll, expect, it } from "vitest";

import { canonicalize } from "../conformance/canonicalize";
import { GcsOracleClient } from "../conformance/oracle-client";

const corpusDirectory = process.env.GCS_CORPUS_DIR;
if (!corpusDirectory) {
  throw new Error("GCS_CORPUS_DIR is required for test:corpus");
}

const oracle = new GcsOracleClient();

afterAll(async () => {
  await oracle.close();
}, 120_000);

it("preserves official normalization for the extended corpus", async () => {
  const files = await findGcsFiles(corpusDirectory);
  expect(
    files.length,
    "extended corpus must contain at least one .gcs file",
  ).toBeGreaterThan(0);

  for (const [index, file] of files.entries()) {
    const relativePath = relative(corpusDirectory, file).split(sep).join("/");
    try {
      const original = await readFile(file, "utf8");
      const roundTrip = serializeGcsV5(parseGcsV5(original));
      const normalizedOriginal = await oracle.normalize(
        `${index}:original`,
        original,
      );
      const normalizedRoundTrip = await oracle.normalize(
        `${index}:round-trip`,
        roundTrip,
      );

      if (!normalizedOriginal.ok) {
        throw new Error(
          `original rejected (${normalizedOriginal.category}): ${normalizedOriginal.message}`,
        );
      }
      if (!normalizedRoundTrip.ok) {
        throw new Error(
          `round trip rejected (${normalizedRoundTrip.category}): ${normalizedRoundTrip.message}`,
        );
      }
      expect(
        canonicalize(normalizedRoundTrip.document),
        `${relativePath}: normalized documents differ`,
      ).toEqual(canonicalize(normalizedOriginal.document));
    } catch (error) {
      throw new Error(`${relativePath}: ${errorMessage(error)}`, {
        cause: error,
      });
    }
  }
}, 1_800_000);

async function findGcsFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findGcsFiles(path)));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".gcs")) {
      files.push(path);
    }
  }
  return files;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
