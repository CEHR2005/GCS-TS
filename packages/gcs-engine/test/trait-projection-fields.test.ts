import { describe, expect, it } from "vitest";

import {
  fxpToRaw,
  projectGcsTraitsV5,
  type GcsDocumentV5,
  type GcsReadonlyJsonValue,
} from "@gcs/gcs-engine";

const PAYLOAD = "AAECAwQFBgcICQoL";
const TRAIT_ID = `t${PAYLOAD}`;
const TRAIT_CONTAINER_ID = `T${PAYLOAD}`;
const MODIFIER_ID = `m${PAYLOAD}`;
const MODIFIER_CONTAINER_ID = `M${PAYLOAD}`;

function expectDeepFrozen(value: GcsReadonlyJsonValue | object): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") {
      expectDeepFrozen(child as GcsReadonlyJsonValue | object);
    }
  }
}

function expectProjectionError(
  document: GcsDocumentV5,
  code: string,
  path: string,
): void {
  expect(() => projectGcsTraitsV5(document)).toThrowError(
    expect.objectContaining({ code, path }),
  );
}

describe("complete strict trait field projection", () => {
  it("projects every approved field without aliases or mutable input references", () => {
    const traitContainer = {
      id: TRAIT_CONTAINER_ID,
      source: {
        library: "container-library",
        path: "container/path",
        id: TRAIT_CONTAINER_ID,
      },
      name: "Container",
      reference: "B1",
      reference_highlight: "B1 highlight",
      local_notes: "Container notes",
      tags: ["container-tag"],
      prereqs: { all: [{ enabled: true }] },
      cr: 6,
      cr_adj: "action_penalty",
      frequency: 18,
      disabled: true,
      vtt_notes: "Container VTT",
      userdesc: "Container description",
      replacements: { oldContainer: "newContainer" },
      third_party: { containerVendor: { value: 1 } },
      calc: { containerTotal: [1, 2] },
      ancestry: "Human",
      template_picker: { mode: { type: "single" } },
      container_type: "ancestry",
      children: [
        {
          id: TRAIT_ID,
          source: {
            library: "trait-library",
            path: "trait/path",
            id: TRAIT_ID,
          },
          name: "Trait",
          reference: "B2",
          reference_highlight: "B2 highlight",
          local_notes: "Trait notes",
          tags: ["trait-tag", "second-tag"],
          prereqs: { any: [{ enabled: false }] },
          cr: 12,
          cr_adj: "reaction_penalty",
          frequency: 9,
          disabled: true,
          vtt_notes: "Trait VTT",
          userdesc: "Trait description",
          replacements: { oldTrait: "newTrait" },
          modifiers: [
            {
              id: MODIFIER_CONTAINER_ID,
              source: {
                library: "modifier-container-library",
                path: "modifier-container/path",
                id: MODIFIER_CONTAINER_ID,
              },
              name: "Modifier Container",
              reference: "B3",
              reference_highlight: "B3 highlight",
              local_notes: "Modifier container notes",
              tags: ["modifier-container-tag"],
              vtt_notes: "Modifier container VTT",
              replacements: { oldModifierContainer: "newModifierContainer" },
              third_party: { modifierContainerVendor: { value: 2 } },
              calc: { modifierContainerTotal: [3, 4] },
              children: [
                {
                  id: MODIFIER_ID,
                  source: {
                    library: "modifier-library",
                    path: "modifier/path",
                    id: MODIFIER_ID,
                  },
                  name: "Modifier",
                  reference: "B4",
                  reference_highlight: "B4 highlight",
                  local_notes: "Modifier notes",
                  tags: ["modifier-tag"],
                  vtt_notes: "Modifier VTT",
                  replacements: { oldModifier: "newModifier" },
                  third_party: { modifierVendor: { value: 3 } },
                  calc: { modifierTotal: [5, 6] },
                  cost_adj: "+10%",
                  use_level_from_trait: true,
                  show_notes_on_weapon: true,
                  affects: "levels_only",
                  features: [{ type: "modifier_bonus", amounts: [1, 2] }],
                  levels: 4,
                  disabled: true,
                },
              ],
            },
          ],
          third_party: { traitVendor: { value: 4 } },
          calc: { traitTotal: [7, 8] },
          base_points: 1.25,
          points_per_level: 2.5,
          levels: 3.75,
          round_down: true,
          can_level: true,
          study: [{ type: "teacher", hours: 4, note: "Taught" }],
          study_hours_needed: "160",
          features: [{ type: "trait_bonus", amounts: [3, 4] }],
          weapons: [{ type: "melee_weapon", defaults: ["DX"] }],
        },
      ],
    };
    const input = {
      version: 5,
      traits: [traitContainer],
    } as GcsDocumentV5;

    const output = projectGcsTraitsV5(input);

    expect(output).toEqual([
      {
        kind: "trait_container",
        id: TRAIT_CONTAINER_ID,
        source: {
          library: "container-library",
          path: "container/path",
          id: TRAIT_CONTAINER_ID,
        },
        name: "Container",
        reference: "B1",
        referenceHighlight: "B1 highlight",
        localNotes: "Container notes",
        tags: ["container-tag"],
        prerequisites: { all: [{ enabled: true }] },
        selfControlRoll: 6,
        selfControlAdjustment: "action_penalty",
        frequency: 18,
        disabled: true,
        vttNotes: "Container VTT",
        userDescription: "Container description",
        replacements: { oldContainer: "newContainer" },
        thirdParty: { containerVendor: { value: 1 } },
        calc: { containerTotal: [1, 2] },
        ancestry: "Human",
        templatePicker: { mode: { type: "single" } },
        containerType: "ancestry",
        children: [
          {
            kind: "trait",
            id: TRAIT_ID,
            source: {
              library: "trait-library",
              path: "trait/path",
              id: TRAIT_ID,
            },
            name: "Trait",
            reference: "B2",
            referenceHighlight: "B2 highlight",
            localNotes: "Trait notes",
            tags: ["trait-tag", "second-tag"],
            prerequisites: { any: [{ enabled: false }] },
            selfControlRoll: 12,
            selfControlAdjustment: "reaction_penalty",
            frequency: 9,
            disabled: true,
            vttNotes: "Trait VTT",
            userDescription: "Trait description",
            replacements: { oldTrait: "newTrait" },
            modifiers: [
              {
                kind: "trait_modifier_container",
                id: MODIFIER_CONTAINER_ID,
                source: {
                  library: "modifier-container-library",
                  path: "modifier-container/path",
                  id: MODIFIER_CONTAINER_ID,
                },
                name: "Modifier Container",
                reference: "B3",
                referenceHighlight: "B3 highlight",
                localNotes: "Modifier container notes",
                tags: ["modifier-container-tag"],
                vttNotes: "Modifier container VTT",
                replacements: {
                  oldModifierContainer: "newModifierContainer",
                },
                thirdParty: { modifierContainerVendor: { value: 2 } },
                calc: { modifierContainerTotal: [3, 4] },
                children: [
                  {
                    kind: "trait_modifier",
                    id: MODIFIER_ID,
                    source: {
                      library: "modifier-library",
                      path: "modifier/path",
                      id: MODIFIER_ID,
                    },
                    name: "Modifier",
                    reference: "B4",
                    referenceHighlight: "B4 highlight",
                    localNotes: "Modifier notes",
                    tags: ["modifier-tag"],
                    vttNotes: "Modifier VTT",
                    replacements: { oldModifier: "newModifier" },
                    thirdParty: { modifierVendor: { value: 3 } },
                    calc: { modifierTotal: [5, 6] },
                    costAdjustment: "+10%",
                    useLevelFromTrait: true,
                    showNotesOnWeapon: true,
                    affects: "levels_only",
                    features: [{ type: "modifier_bonus", amounts: [1, 2] }],
                    levels: 40000n,
                    disabled: true,
                  },
                ],
              },
            ],
            thirdParty: { traitVendor: { value: 4 } },
            calc: { traitTotal: [7, 8] },
            basePoints: 12500n,
            pointsPerLevel: 25000n,
            levels: 37500n,
            roundDown: true,
            canLevel: true,
            study: [{ type: "teacher", hours: 40000n, note: "Taught" }],
            studyHoursNeeded: "160",
            features: [{ type: "trait_bonus", amounts: [3, 4] }],
            weapons: [{ type: "melee_weapon", defaults: ["DX"] }],
          },
        ],
      },
    ]);

    const projectedContainer = output?.[0];
    expect(projectedContainer?.kind).toBe("trait_container");
    if (projectedContainer?.kind !== "trait_container") {
      throw new Error("expected projected trait container");
    }
    const projectedTrait = projectedContainer.children?.[0];
    expect(projectedTrait?.kind).toBe("trait");
    if (projectedTrait?.kind !== "trait") {
      throw new Error("expected projected trait");
    }
    const projectedModifierContainer = projectedTrait.modifiers?.[0];
    expect(projectedModifierContainer?.kind).toBe("trait_modifier_container");
    if (projectedModifierContainer?.kind !== "trait_modifier_container") {
      throw new Error("expected projected modifier container");
    }
    const projectedModifier = projectedModifierContainer.children?.[0];
    expect(projectedModifier?.kind).toBe("trait_modifier");
    if (projectedModifier?.kind !== "trait_modifier") {
      throw new Error("expected projected modifier");
    }

    expect(fxpToRaw(projectedTrait.basePoints!)).toBe(12_500n);
    expect(fxpToRaw(projectedTrait.pointsPerLevel!)).toBe(25_000n);
    expect(fxpToRaw(projectedTrait.levels!)).toBe(37_500n);
    expect(fxpToRaw(projectedTrait.study![0]!.hours)).toBe(40_000n);
    expect(fxpToRaw(projectedModifier.levels!)).toBe(40_000n);
    expectDeepFrozen(output!);

    const inputTrait = traitContainer.children[0]!;
    const inputModifierContainer = inputTrait.modifiers[0]!;
    const inputModifier = inputModifierContainer.children[0]!;
    traitContainer.source.library = "mutated";
    traitContainer.tags[0] = "mutated";
    traitContainer.prereqs.all[0]!.enabled = false;
    traitContainer.replacements.oldContainer = "mutated";
    inputTrait.study[0]!.note = "mutated";
    inputTrait.features[0]!.amounts[0] = 99;
    inputModifierContainer.source.path = "mutated";
    inputModifier.features[0]!.amounts[0] = 99;

    expect(projectedContainer.source?.library).toBe("container-library");
    expect(projectedContainer.tags).toEqual(["container-tag"]);
    expect(projectedContainer.prerequisites).toEqual({
      all: [{ enabled: true }],
    });
    expect(projectedContainer.replacements).toEqual({
      oldContainer: "newContainer",
    });
    expect(projectedTrait.study?.[0]?.note).toBe("Taught");
    expect(projectedTrait.features).toEqual([
      { type: "trait_bonus", amounts: [3, 4] },
    ]);
    expect(projectedModifierContainer.source?.path).toBe(
      "modifier-container/path",
    );
    expect(projectedModifier.features).toEqual([
      { type: "modifier_bonus", amounts: [1, 2] },
    ]);
  });

  it("does not interpret descriptive aliases as canonical persisted keys", () => {
    const output = projectGcsTraitsV5({
      version: 5,
      traits: [
        {
          id: TRAIT_ID,
          self_control_roll: 12,
          self_control_adjustment: "reaction_penalty",
          user_description: "Alias",
        },
      ],
    });

    expect(output).toEqual([{ kind: "trait", id: TRAIT_ID }]);
  });

  it("preserves absent direct fields instead of inserting defaults", () => {
    const output = projectGcsTraitsV5({
      version: 5,
      traits: [{ id: TRAIT_ID }],
    });

    expect(output).toEqual([{ kind: "trait", id: TRAIT_ID }]);
    expect(Object.keys(output![0]!)).toEqual(["kind", "id"]);
  });
});

describe("strict trait field errors", () => {
  it.each([
    ["string", { name: 1 }, "/traits/0/name"],
    ["boolean", { disabled: 1 }, "/traits/0/disabled"],
    ["string array", { tags: ["valid", 1] }, "/traits/0/tags/1"],
    [
      "string map",
      { replacements: { valid: "value", invalid: 1 } },
      "/traits/0/replacements/invalid",
    ],
    ["opaque object", { prereqs: [] }, "/traits/0/prereqs"],
    ["opaque array", { features: {} }, "/traits/0/features"],
    ["source", { source: [] }, "/traits/0/source"],
    ["study", { study: [null] }, "/traits/0/study/0"],
    ["Fxp", { base_points: "1.25" }, "/traits/0/base_points"],
  ])("rejects a wrong %s value at its exact path", (_name, fields, path) => {
    expectProjectionError(
      { version: 5, traits: [{ id: TRAIT_ID, ...fields }] },
      _name === "Fxp" ? "UNSAFE_FXP_NUMBER" : "INVALID_FIELD",
      path,
    );
  });

  it.each([
    ["self-control roll", { cr: 5 }, "/traits/0/cr"],
    [
      "self-control adjustment",
      { cr_adj: "Reaction_Penalty" },
      "/traits/0/cr_adj",
    ],
    ["frequency", { frequency: 10 }, "/traits/0/frequency"],
    [
      "study type",
      { study: [{ type: "Teacher", hours: 1 }] },
      "/traits/0/study/0/type",
    ],
    [
      "study level",
      { study_hours_needed: 160 },
      "/traits/0/study_hours_needed",
    ],
  ])(
    "rejects a non-canonical %s enum at its exact path",
    (_name, fields, path) => {
      expectProjectionError(
        { version: 5, traits: [{ id: TRAIT_ID, ...fields }] },
        "INVALID_FIELD",
        path,
      );
    },
  );

  it("rejects non-canonical container and modifier enum values", () => {
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_CONTAINER_ID, container_type: "race" }],
      },
      "INVALID_FIELD",
      "/traits/0/container_type",
    );
    expectProjectionError(
      {
        version: 5,
        traits: [
          {
            id: TRAIT_ID,
            modifiers: [{ id: MODIFIER_ID, affects: "Levels_Only" }],
          },
        ],
      },
      "INVALID_FIELD",
      "/traits/0/modifiers/0/affects",
    );
  });

  it("requires every source property at its exact path", () => {
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_ID, source: { path: "path", id: TRAIT_ID } }],
      },
      "INVALID_FIELD",
      "/traits/0/source/library",
    );
    expectProjectionError(
      {
        version: 5,
        traits: [
          {
            id: TRAIT_ID,
            source: { library: "library", id: TRAIT_ID },
          },
        ],
      },
      "INVALID_FIELD",
      "/traits/0/source/path",
    );
    expectProjectionError(
      {
        version: 5,
        traits: [
          {
            id: TRAIT_ID,
            source: { library: "library", path: "path", id: 1 },
          },
        ],
      },
      "INVALID_FIELD",
      "/traits/0/source/id",
    );
    expectProjectionError(
      {
        version: 5,
        traits: [
          {
            id: TRAIT_ID,
            source: { library: "library", path: "path", id: "invalid" },
          },
        ],
      },
      "INVALID_FIELD",
      "/traits/0/source/id",
    );
  });

  it("requires both study fields at their exact paths", () => {
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_ID, study: [{ hours: 1 }] }],
      },
      "INVALID_FIELD",
      "/traits/0/study/0/type",
    );
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_ID, study: [{ type: "self" }] }],
      },
      "INVALID_FIELD",
      "/traits/0/study/0/hours",
    );
  });

  it("rejects a source TID kind that differs from its enclosing node", () => {
    expectProjectionError(
      {
        version: 5,
        traits: [
          {
            id: TRAIT_ID,
            source: {
              library: "library",
              path: "path",
              id: TRAIT_CONTAINER_ID,
            },
          },
        ],
      },
      "INVALID_NODE_KIND",
      "/traits/0/source/id",
    );
  });
});
