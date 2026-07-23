import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  calculateGcsTraitPointsV5,
  parseGcsV5,
  projectGcsTraitsV5,
} from "@gcs/gcs-engine";
import { describe, expect, it } from "vitest";
import { fromOracleCalculationResult } from "./conformance-shape";
import { runTraitCalculationOracle } from "./oracle-runner";
import type { TraitCalculationOracleRequest } from "./oracle-protocol";
import { TRAIT_CALCULATION_VECTORS } from "./vectors";

const fixtureFiles = [
  "wang-laowu.gcs",
  "dragon-large-fire.gcs",
  "lich.gcs",
] as const;

describe("TypeScript-to-Go trait calculation conformance", () => {
  it("matches the deterministic matrix and all committed fixtures in both modes without changing the projection", async () => {
    const fixtures = await Promise.all(
      fixtureFiles.map(async (file) => ({
        id: `fixture:${file}`,
        document: await readFile(resolve("fixtures/gcs-v5", file), "utf8"),
      })),
    );
    const documents = [...TRAIT_CALCULATION_VECTORS, ...fixtures];
    const projections = documents.map(({ document }) =>
      projectGcsTraitsV5(parseGcsV5(document)),
    );
    const snapshots = projections.map((projection) =>
      structuredClone(projection),
    );
    const requests: TraitCalculationOracleRequest[] = [];
    const actual: unknown[] = [];
    for (const [index, item] of documents.entries()) {
      for (const mode of [false, true]) {
        requests.push({
          id: `${item.id}:${mode ? "multiplicative" : "additive"}`,
          op: "traits.calculate",
          document: item.document,
          use_multiplicative_modifiers: mode,
        });
        actual.push(
          calculateGcsTraitPointsV5(projections[index], {
            useMultiplicativeModifiers: mode,
          }),
        );
      }
    }
    const responses = runTraitCalculationOracle(requests);
    for (const [index, response] of responses.entries())
      expect(actual[index], requests[index]!.id).toEqual(
        fromOracleCalculationResult(response.result),
      );
    projections.forEach((projection, index) =>
      expect(projection, documents[index]!.id).toEqual(snapshots[index]),
    );
  });
});
