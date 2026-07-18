import { describe, expect, expectTypeOf, it } from "vitest";

import {
  GCS_TRAIT_PROJECTION_MAX_DEPTH,
  GcsTraitProjectionError,
  type GcsReadonlyJsonObject,
  type GcsReadonlyJsonValue,
  type GcsSourceV5,
  type GcsStudyV5,
  type GcsTraitContainerV5,
  type GcsTraitModifierContainerV5,
  type GcsTraitModifierNodeV5,
  type GcsTraitModifierV5,
  type GcsTraitNodeV5,
  type GcsTraitProjectionErrorCode,
  type GcsTraitV5,
} from "@gcs/gcs-engine";

type HasKey<T, Key extends PropertyKey> = Key extends keyof T ? true : false;

describe("readonly trait projection public types", () => {
  it("exports the complete public type surface", () => {
    expectTypeOf<GcsReadonlyJsonValue>().not.toBeNever();
    expectTypeOf<GcsReadonlyJsonObject>().toBeObject();
    expectTypeOf<GcsSourceV5>().toBeObject();
    expectTypeOf<GcsStudyV5>().toBeObject();
    expectTypeOf<GcsTraitNodeV5>().not.toBeNever();
    expectTypeOf<GcsTraitV5>().toBeObject();
    expectTypeOf<GcsTraitContainerV5>().toBeObject();
    expectTypeOf<GcsTraitModifierNodeV5>().not.toBeNever();
    expectTypeOf<GcsTraitModifierV5>().toBeObject();
    expectTypeOf<GcsTraitModifierContainerV5>().toBeObject();
    expectTypeOf<GcsTraitProjectionErrorCode>().toEqualTypeOf<
      | "INVALID_TRAITS"
      | "INVALID_TRAIT"
      | "INVALID_TRAIT_MODIFIER"
      | "INVALID_FIELD"
      | "INVALID_NODE_KIND"
      | "INVALID_CONTAINER_SHAPE"
      | "UNSAFE_FXP_NUMBER"
      | "CYCLE_DETECTED"
      | "MAX_DEPTH_EXCEEDED"
    >();
  });

  it("narrows trait and modifier unions by kind", () => {
    const narrowTrait = (node: GcsTraitNodeV5): void => {
      if (node.kind === "trait") {
        expectTypeOf(node).toEqualTypeOf<GcsTraitV5>();
      } else {
        expectTypeOf(node).toEqualTypeOf<GcsTraitContainerV5>();
      }
    };
    const narrowModifier = (node: GcsTraitModifierNodeV5): void => {
      if (node.kind === "trait_modifier") {
        expectTypeOf(node).toEqualTypeOf<GcsTraitModifierV5>();
      } else {
        expectTypeOf(node).toEqualTypeOf<GcsTraitModifierContainerV5>();
      }
    };

    expectTypeOf(narrowTrait).parameter(0).toEqualTypeOf<GcsTraitNodeV5>();
    expectTypeOf(narrowModifier)
      .parameter(0)
      .toEqualTypeOf<GcsTraitModifierNodeV5>();
  });

  it("keeps leaf-only and container-only fields separate", () => {
    expectTypeOf<HasKey<GcsTraitV5, "children">>().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<GcsTraitContainerV5, "basePoints">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<GcsTraitModifierV5, "children">
    >().toEqualTypeOf<false>();
    expectTypeOf<
      HasKey<GcsTraitModifierContainerV5, "costAdjustment">
    >().toEqualTypeOf<false>();
  });
});

describe("trait projection errors", () => {
  it("exports the fixed depth limit", () => {
    expect(GCS_TRAIT_PROJECTION_MAX_DEPTH).toBe(256);
    expectTypeOf(GCS_TRAIT_PROJECTION_MAX_DEPTH).toEqualTypeOf<256>();
  });

  it("retains its stable name, code, message, and required path", () => {
    const error = new GcsTraitProjectionError(
      "INVALID_FIELD",
      "invalid name",
      "/traits/0/name",
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("GcsTraitProjectionError");
    expect(error.code).toBe("INVALID_FIELD");
    expect(error.message).toBe("invalid name");
    expect(error.path).toBe("/traits/0/name");
  });
});
