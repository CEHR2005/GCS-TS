import { describe, expect, it } from "vitest";

import { projectGcsTraitsV5, type GcsDocumentV5 } from "@gcs/gcs-engine";

const TRAIT_ID = "tAAECAwQFBgcICQoL";
const TRAIT_CONTAINER_ID = "TAAECAwQFBgcICQoL";
const MODIFIER_ID = "mAAECAwQFBgcICQoL";
const MODIFIER_CONTAINER_ID = "MAAECAwQFBgcICQoL";

describe("strict trait tree projection", () => {
  it("distinguishes absent traits from a frozen empty traits array", () => {
    expect(projectGcsTraitsV5({ version: 5 })).toBeUndefined();

    const input: GcsDocumentV5 = { version: 5, traits: [] };
    const output = projectGcsTraitsV5(input);

    expect(output).toEqual([]);
    expect(output).not.toBe(input.traits);
    expect(Object.isFrozen(output)).toBe(true);
  });

  it("projects recursive trait structure without retaining input aliases", () => {
    const child = { id: TRAIT_ID };
    const children = [child];
    const container = { id: TRAIT_CONTAINER_ID, children };
    const traits = [container];
    const input = { version: 5, traits } as GcsDocumentV5;

    const output = projectGcsTraitsV5(input);

    expect(output).toEqual([
      {
        kind: "trait_container",
        id: TRAIT_CONTAINER_ID,
        children: [{ kind: "trait", id: TRAIT_ID }],
      },
    ]);
    expect(output).not.toBe(traits);
    expect(output?.[0]).not.toBe(container);
    expect(output?.[0]?.kind).toBe("trait_container");
    if (output?.[0]?.kind !== "trait_container") {
      throw new Error("expected a projected trait container");
    }
    expect(output[0].children).not.toBe(children);
    expect(output[0].children?.[0]).not.toBe(child);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output[0])).toBe(true);
    expect(Object.isFrozen(output[0].children)).toBe(true);
    expect(Object.isFrozen(output[0].children?.[0])).toBe(true);
  });

  it("preserves absent and empty children independently", () => {
    const output = projectGcsTraitsV5({
      version: 5,
      traits: [
        { id: TRAIT_CONTAINER_ID },
        { id: TRAIT_CONTAINER_ID, children: [] },
      ],
    });

    expect(output).toEqual([
      { kind: "trait_container", id: TRAIT_CONTAINER_ID },
      { kind: "trait_container", id: TRAIT_CONTAINER_ID, children: [] },
    ]);
    expect(output?.[0]?.kind).toBe("trait_container");
    expect(output?.[1]?.kind).toBe("trait_container");
    if (
      output?.[0]?.kind !== "trait_container" ||
      output[1]?.kind !== "trait_container"
    ) {
      throw new Error("expected projected trait containers");
    }
    expect(output[0].children).toBeUndefined();
    expect(Object.isFrozen(output[1].children)).toBe(true);
  });

  it("projects recursive modifiers and freezes every structural value", () => {
    const modifierLeaf = { id: MODIFIER_ID };
    const modifierChildren = [modifierLeaf];
    const modifierContainer = {
      id: MODIFIER_CONTAINER_ID,
      children: modifierChildren,
    };
    const modifiers = [modifierContainer];
    const trait = { id: TRAIT_ID, modifiers };
    const traits = [trait];
    const input = { version: 5, traits } as GcsDocumentV5;

    const output = projectGcsTraitsV5(input);

    expect(output).toEqual([
      {
        kind: "trait",
        id: TRAIT_ID,
        modifiers: [
          {
            kind: "trait_modifier_container",
            id: MODIFIER_CONTAINER_ID,
            children: [{ kind: "trait_modifier", id: MODIFIER_ID }],
          },
        ],
      },
    ]);
    expect(output?.[0]?.kind).toBe("trait");
    if (output?.[0]?.kind !== "trait") {
      throw new Error("expected a projected trait leaf");
    }
    const projectedContainer = output[0].modifiers?.[0];
    expect(projectedContainer?.kind).toBe("trait_modifier_container");
    if (projectedContainer?.kind !== "trait_modifier_container") {
      throw new Error("expected a projected modifier container");
    }
    expect(output).not.toBe(traits);
    expect(output[0]).not.toBe(trait);
    expect(output[0].modifiers).not.toBe(modifiers);
    expect(projectedContainer).not.toBe(modifierContainer);
    expect(projectedContainer.children).not.toBe(modifierChildren);
    expect(projectedContainer.children?.[0]).not.toBe(modifierLeaf);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output[0])).toBe(true);
    expect(Object.isFrozen(output[0].modifiers)).toBe(true);
    expect(Object.isFrozen(projectedContainer)).toBe(true);
    expect(Object.isFrozen(projectedContainer.children)).toBe(true);
    expect(Object.isFrozen(projectedContainer.children?.[0])).toBe(true);
  });

  it("preserves absent and empty modifiers and modifier children", () => {
    const output = projectGcsTraitsV5({
      version: 5,
      traits: [
        { id: TRAIT_ID },
        { id: TRAIT_ID, modifiers: [] },
        { id: TRAIT_ID, modifiers: [{ id: MODIFIER_CONTAINER_ID }] },
        {
          id: TRAIT_ID,
          modifiers: [{ id: MODIFIER_CONTAINER_ID, children: [] }],
        },
      ],
    });

    expect(output).toEqual([
      { kind: "trait", id: TRAIT_ID },
      { kind: "trait", id: TRAIT_ID, modifiers: [] },
      {
        kind: "trait",
        id: TRAIT_ID,
        modifiers: [
          { kind: "trait_modifier_container", id: MODIFIER_CONTAINER_ID },
        ],
      },
      {
        kind: "trait",
        id: TRAIT_ID,
        modifiers: [
          {
            kind: "trait_modifier_container",
            id: MODIFIER_CONTAINER_ID,
            children: [],
          },
        ],
      },
    ]);
    expect(Object.isFrozen(output?.[1]?.modifiers)).toBe(true);
    const emptyChildren = output?.[3]?.modifiers?.[0];
    expect(emptyChildren?.kind).toBe("trait_modifier_container");
    if (emptyChildren?.kind !== "trait_modifier_container") {
      throw new Error("expected a projected modifier container");
    }
    expect(Object.isFrozen(emptyChildren.children)).toBe(true);
  });

  it("allows shared non-ancestor nodes and projects independent clones", () => {
    const shared = { id: TRAIT_ID };
    const output = projectGcsTraitsV5({
      version: 5,
      traits: [
        { id: TRAIT_CONTAINER_ID, children: [shared] },
        { id: TRAIT_CONTAINER_ID, children: [shared] },
      ],
    });

    expect(output?.[0]?.kind).toBe("trait_container");
    expect(output?.[1]?.kind).toBe("trait_container");
    if (
      output?.[0]?.kind !== "trait_container" ||
      output[1]?.kind !== "trait_container"
    ) {
      throw new Error("expected projected trait containers");
    }
    expect(output[0].children?.[0]).toEqual(output[1].children?.[0]);
    expect(output[0].children?.[0]).not.toBe(output[1].children?.[0]);
  });
});
