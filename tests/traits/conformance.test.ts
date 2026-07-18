import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseGcsV5, projectGcsTraitsV5 } from "@gcs/gcs-engine";

import {
  firstJsonDifferencePointer,
  sortJsonValue,
  toTraitsOracleShape,
} from "./conformance-shape";
import { runTraitsOracle } from "./oracle-runner";
import type { TraitsOracleRequest } from "./oracle-protocol";

const fixturesDirectory = resolve("fixtures/gcs-v5");

type FixtureManifest = {
  readonly fixtures: readonly { readonly file: string }[];
};

const COMPLETE_SYNTHETIC_DOCUMENT = `{
  "version": 5,
  "traits": [{
    "id": "TAAECAwQFBgcICQoL",
    "source": {
      "library": "container-library",
      "path": "container/path",
      "id": "TAAECAwQFBgcICQoL"
    },
    "name": "Container",
    "reference": "B1",
    "reference_highlight": "B1 highlight",
    "local_notes": "Container notes",
    "tags": ["container-tag"],
    "prereqs": {"all": true},
    "cr": 6,
    "cr_adj": "action_penalty",
    "frequency": 18,
    "disabled": true,
    "vtt_notes": "Container VTT",
    "userdesc": "Container description",
    "replacements": {"oldContainer": "newContainer"},
    "third_party": {"ignored": true},
    "calc": {"ignored": true},
    "ancestry": "Human",
    "template_picker": {"ignored": true},
    "container_type": "ancestry",
    "children": [{
      "id": "tAAECAwQFBgcICQoL",
      "source": {
        "library": "trait-library",
        "path": "trait/path",
        "id": "tAAECAwQFBgcICQoL"
      },
      "name": "Trait",
      "reference": "B2",
      "reference_highlight": "B2 highlight",
      "local_notes": "Trait notes",
      "tags": ["second-tag", "trait-tag"],
      "prereqs": {"all": false},
      "cr": 12,
      "cr_adj": "reaction_penalty",
      "frequency": 9,
      "disabled": true,
      "vtt_notes": "Trait VTT",
      "userdesc": "Trait description",
      "replacements": {"oldTrait": "newTrait"},
      "modifiers": [{
        "id": "MAAECAwQFBgcICQoL",
        "source": {
          "library": "modifier-container-library",
          "path": "modifier-container/path",
          "id": "MAAECAwQFBgcICQoL"
        },
        "name": "Modifier Container",
        "reference": "B3",
        "reference_highlight": "B3 highlight",
        "local_notes": "Modifier container notes",
        "tags": ["modifier-container-tag"],
        "vtt_notes": "Modifier container VTT",
        "replacements": {"oldModifierContainer": "newModifierContainer"},
        "third_party": {"ignored": true},
        "calc": {"ignored": true},
        "children": [{
          "id": "mAAECAwQFBgcICQoL",
          "source": {
            "library": "modifier-library",
            "path": "modifier/path",
            "id": "mAAECAwQFBgcICQoL"
          },
          "name": "Modifier",
          "reference": "B4",
          "reference_highlight": "B4 highlight",
          "local_notes": "Modifier notes",
          "tags": ["modifier-tag"],
          "vtt_notes": "Modifier VTT",
          "replacements": {"oldModifier": "newModifier"},
          "third_party": {"ignored": true},
          "calc": {"ignored": true},
          "cost_adj": "+10%",
          "use_level_from_trait": true,
          "show_notes_on_weapon": true,
          "affects": "levels_only",
          "features": [{"ignored": true}],
          "levels": 4,
          "disabled": true
        }]
      }],
      "third_party": {"ignored": true},
      "calc": {"ignored": true},
      "base_points": 1.25,
      "points_per_level": 2.5,
      "levels": 3.75,
      "round_down": true,
      "can_level": true,
      "study": [{"type": "teacher", "hours": 4, "note": "Taught"}],
      "study_hours_needed": "160",
      "features": [{"ignored": true}],
      "weapons": [{"ignored": true}]
    }]
  }]
}`;

describe("traits oracle comparison shape", () => {
  it("uses raw Fxp strings and only normalizes omitted GCS zero values", () => {
    const document = parseGcsV5(`{
      "version": 5,
      "traits": [{
        "id": "tAAECAwQFBgcICQoL",
        "base_points": 1.25,
        "modifiers": [{"id": "mAAECAwQFBgcICQoL"}]
      }]
    }`);

    expect(toTraitsOracleShape(projectGcsTraitsV5(document))).toEqual({
      traits: [
        {
          kind: "trait",
          id: "tAAECAwQFBgcICQoL",
          name: "",
          reference: "",
          referenceHighlight: "",
          localNotes: "",
          tags: null,
          selfControlRoll: 0,
          selfControlAdjustment: "none",
          frequency: 0,
          disabled: false,
          vttNotes: "",
          userDescription: "",
          replacements: null,
          modifiersPresent: true,
          modifiers: [
            {
              kind: "trait_modifier",
              id: "mAAECAwQFBgcICQoL",
              name: "",
              reference: "",
              referenceHighlight: "",
              localNotes: "",
              tags: null,
              vttNotes: "",
              replacements: null,
              costAdjustment: "",
              useLevelFromTrait: false,
              showNotesOnWeapon: false,
              affects: "total",
              levelsRaw: "0",
              disabled: false,
              childrenPresent: false,
            },
          ],
          basePointsRaw: "12500",
          pointsPerLevelRaw: "0",
          levelsRaw: "0",
          roundDown: false,
          canLevel: false,
          study: [],
          studyHoursNeeded: "",
          childrenPresent: false,
        },
      ],
    });
  });

  it("recursively sorts object keys without reordering arrays", () => {
    expect(sortJsonValue({ z: { b: 2, a: 1 }, a: [{ d: 4, c: 3 }] })).toEqual({
      a: [{ c: 3, d: 4 }],
      z: { a: 1, b: 2 },
    });
  });

  it("preserves prototype-named JSON keys while sorting", () => {
    const replacements = Object.create(null) as Record<string, unknown>;
    replacements.__proto__ = { z: 2, a: 1 };

    const sorted = sortJsonValue({ replacements });

    expect(sorted).toEqual({
      replacements: Object.fromEntries([["__proto__", { a: 1, z: 2 }]]),
    });
    expect(Object.keys(sorted as object)).toEqual(["replacements"]);
    expect(
      Object.keys(
        (sorted as { replacements: Record<string, unknown> }).replacements,
      ),
    ).toEqual(["__proto__"]);
  });

  it("reports the first differing RFC 6901 JSON pointer", () => {
    expect(
      firstJsonDifferencePointer(
        { traits: [{ values: { "a/b~c": 1 } }] },
        { traits: [{ values: { "a/b~c": 2 } }] },
      ),
    ).toBe("/traits/0/values/a~1b~0c");
  });
});

describe("TypeScript-to-Go typed trait conformance", () => {
  it("matches every committed fixture and the complete synthetic document", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(fixturesDirectory, "manifest.json"), "utf8"),
    ) as FixtureManifest;
    const documents = await Promise.all(
      manifest.fixtures.map(async ({ file }) => ({
        id: `fixture:${file}`,
        document: await readFile(resolve(fixturesDirectory, file), "utf8"),
      })),
    );
    documents.push({
      id: "synthetic:complete-fields",
      document: COMPLETE_SYNTHETIC_DOCUMENT,
    });
    const requests: readonly TraitsOracleRequest[] = documents.map(
      ({ id, document }) => ({ id, op: "traits.project", document }),
    );

    const responses = runTraitsOracle(requests);

    for (const [index, response] of responses.entries()) {
      const request = requests[index]!;
      if (!response.ok) {
        throw new Error(
          `traits oracle failure for ${request.id}: ${response.category}: ${response.message}`,
        );
      }
      const typescriptShape = sortJsonValue(
        toTraitsOracleShape(projectGcsTraitsV5(parseGcsV5(request.document))),
      );
      const goShape = sortJsonValue(response.result);
      const difference = firstJsonDifferencePointer(typescriptShape, goShape);

      expect(
        difference,
        `traits conformance mismatch for ${request.id} at ${difference ?? "<none>"}`,
      ).toBeUndefined();
      expect(
        typescriptShape,
        `traits conformance mismatch for ${request.id}`,
      ).toEqual(goShape);
    }
  });
});
