import { describe, expect, it } from "vitest";

import { projectGcsTraitsV5, type GcsDocumentV5 } from "@gcs/gcs-engine";
import {
  readOptionalBoolean,
  readOptionalString,
} from "../src/traits/fields.js";

const TRAIT_ID = "tAAECAwQFBgcICQoL";
const TRAIT_CONTAINER_ID = "TAAECAwQFBgcICQoL";
const MODIFIER_ID = "mAAECAwQFBgcICQoL";
const MODIFIER_CONTAINER_ID = "MAAECAwQFBgcICQoL";

function expectProjectionError(
  document: GcsDocumentV5,
  code: string,
  path: string,
): void {
  expect(() => projectGcsTraitsV5(document)).toThrowError(
    expect.objectContaining({ code, path }),
  );
}

describe("strict trait projection errors", () => {
  it("rejects a non-array traits field at /traits", () => {
    expectProjectionError(
      { version: 5, traits: {} },
      "INVALID_TRAITS",
      "/traits",
    );
  });

  it.each([null, [], "trait", 3])(
    "rejects a non-object trait entry %#",
    (value) => {
      expectProjectionError(
        { version: 5, traits: [value] } as GcsDocumentV5,
        "INVALID_TRAIT",
        "/traits/0",
      );
    },
  );

  it.each([
    ["missing", {}],
    ["undefined", { id: undefined }],
    ["null", { id: null }],
    ["non-string", { id: 3 }],
    ["invalid syntax", { id: "not-a-tid" }],
  ])("rejects a %s trait id at its field path", (_name, trait) => {
    expectProjectionError(
      { version: 5, traits: [trait] } as GcsDocumentV5,
      "INVALID_FIELD",
      "/traits/0/id",
    );
  });

  it.each([MODIFIER_ID, MODIFIER_CONTAINER_ID, "sAAECAwQFBgcICQoL"])(
    "rejects TID kind %s at a trait path",
    (id) => {
      expectProjectionError(
        { version: 5, traits: [{ id }] },
        "INVALID_NODE_KIND",
        "/traits/0/id",
      );
    },
  );

  it("rejects non-array children and modifiers at their exact paths", () => {
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_CONTAINER_ID, children: {} }],
      } as GcsDocumentV5,
      "INVALID_FIELD",
      "/traits/0/children",
    );
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_ID, modifiers: {} }],
      } as GcsDocumentV5,
      "INVALID_FIELD",
      "/traits/0/modifiers",
    );
  });

  it("rejects non-object and malformed modifier entries", () => {
    expectProjectionError(
      { version: 5, traits: [{ id: TRAIT_ID, modifiers: [null] }] },
      "INVALID_TRAIT_MODIFIER",
      "/traits/0/modifiers/0",
    );
    expectProjectionError(
      { version: 5, traits: [{ id: TRAIT_ID, modifiers: [{}] }] },
      "INVALID_FIELD",
      "/traits/0/modifiers/0/id",
    );
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_ID, modifiers: [{ id: "invalid" }] }],
      },
      "INVALID_FIELD",
      "/traits/0/modifiers/0/id",
    );
  });

  it.each([TRAIT_ID, TRAIT_CONTAINER_ID])(
    "rejects trait TID kind %s in modifiers",
    (id) => {
      expectProjectionError(
        { version: 5, traits: [{ id: TRAIT_ID, modifiers: [{ id }] }] },
        "INVALID_NODE_KIND",
        "/traits/0/modifiers/0/id",
      );
    },
  );

  it.each(["ancestry", "template_picker", "container_type", "children"])(
    "rejects present trait leaf container field %s",
    (field) => {
      expectProjectionError(
        {
          version: 5,
          traits: [{ id: TRAIT_ID, [field]: undefined }],
        } as GcsDocumentV5,
        "INVALID_CONTAINER_SHAPE",
        `/traits/0/${field}`,
      );
    },
  );

  it.each([
    "base_points",
    "points_per_level",
    "levels",
    "round_down",
    "can_level",
    "study",
    "study_hours_needed",
    "features",
    "weapons",
  ])("rejects present trait container leaf field %s", (field) => {
    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_CONTAINER_ID, [field]: undefined }],
      } as GcsDocumentV5,
      "INVALID_CONTAINER_SHAPE",
      `/traits/0/${field}`,
    );
  });

  it("rejects children on modifier leaves", () => {
    expectProjectionError(
      {
        version: 5,
        traits: [
          {
            id: TRAIT_ID,
            modifiers: [{ id: MODIFIER_ID, children: undefined }],
          },
        ],
      } as unknown as GcsDocumentV5,
      "INVALID_CONTAINER_SHAPE",
      "/traits/0/modifiers/0/children",
    );
  });

  it.each([
    "cost_adj",
    "use_level_from_trait",
    "show_notes_on_weapon",
    "affects",
    "features",
    "levels",
    "disabled",
  ])("rejects present modifier container leaf field %s", (field) => {
    expectProjectionError(
      {
        version: 5,
        traits: [
          {
            id: TRAIT_ID,
            modifiers: [{ id: MODIFIER_CONTAINER_ID, [field]: undefined }],
          },
        ],
      } as GcsDocumentV5,
      "INVALID_CONTAINER_SHAPE",
      `/traits/0/modifiers/0/${field}`,
    );
  });

  it("rejects an active-ancestor trait cycle at the recursive path", () => {
    const trait: { id: string; children?: unknown[] } = {
      id: TRAIT_CONTAINER_ID,
    };
    trait.children = [trait];

    expectProjectionError(
      { version: 5, traits: [trait] } as GcsDocumentV5,
      "CYCLE_DETECTED",
      "/traits/0/children/0",
    );
  });

  it("rejects an active-ancestor modifier cycle at the recursive path", () => {
    const modifier: { id: string; children?: unknown[] } = {
      id: MODIFIER_CONTAINER_ID,
    };
    modifier.children = [modifier];

    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_ID, modifiers: [modifier] }],
      } as GcsDocumentV5,
      "CYCLE_DETECTED",
      "/traits/0/modifiers/0/children/0",
    );
  });

  it("rejects trait nesting at depth 257 with the exact path", () => {
    let trait: Record<string, unknown> = { id: TRAIT_ID };
    for (let depth = 0; depth < 256; depth += 1) {
      trait = { id: TRAIT_CONTAINER_ID, children: [trait] };
    }

    expectProjectionError(
      { version: 5, traits: [trait] } as GcsDocumentV5,
      "MAX_DEPTH_EXCEEDED",
      `/traits/0${"/children/0".repeat(256)}`,
    );
  });

  it("rejects modifier nesting at depth 257 with the exact path", () => {
    let modifier: Record<string, unknown> = { id: MODIFIER_ID };
    for (let depth = 0; depth < 255; depth += 1) {
      modifier = { id: MODIFIER_CONTAINER_ID, children: [modifier] };
    }

    expectProjectionError(
      {
        version: 5,
        traits: [{ id: TRAIT_ID, modifiers: [modifier] }],
      } as GcsDocumentV5,
      "MAX_DEPTH_EXCEEDED",
      `/traits/0/modifiers/0${"/children/0".repeat(255)}`,
    );
  });
});

describe("focused optional scalar readers", () => {
  it("distinguishes absent properties from present undefined values", () => {
    expect(readOptionalString({}, "name", "/traits/0")).toBeUndefined();
    expect(readOptionalBoolean({}, "disabled", "/traits/0")).toBeUndefined();

    expect(() =>
      readOptionalString({ name: undefined }, "name", "/traits/0"),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_FIELD",
        path: "/traits/0/name",
      }),
    );
    expect(() =>
      readOptionalBoolean({ disabled: undefined }, "disabled", "/traits/0"),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_FIELD",
        path: "/traits/0/disabled",
      }),
    );
  });

  it("accepts exact scalar types and rejects null or the wrong type", () => {
    expect(readOptionalString({ name: "Trait" }, "name", "/traits/0")).toBe(
      "Trait",
    );
    expect(
      readOptionalBoolean({ disabled: false }, "disabled", "/traits/0"),
    ).toBe(false);

    expect(() =>
      readOptionalString({ name: null }, "name", "/traits/0"),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_FIELD",
        path: "/traits/0/name",
      }),
    );
    expect(() =>
      readOptionalBoolean({ disabled: 0 }, "disabled", "/traits/0"),
    ).toThrowError(
      expect.objectContaining({
        code: "INVALID_FIELD",
        path: "/traits/0/disabled",
      }),
    );
  });
});
