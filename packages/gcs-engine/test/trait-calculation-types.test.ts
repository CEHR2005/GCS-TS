import { describe, expectTypeOf, it } from "vitest";

import {
  type GcsTraitCalculationNodeV5,
  type GcsTraitCalculationOptionsV5,
  type GcsTraitCalculationV5,
  type GcsTraitContainerCalculationV5,
} from "@gcs/gcs-engine";

type HasKey<T, Key extends PropertyKey> = Key extends keyof T ? true : false;

describe("trait calculation public types", () => {
  it("exports the exact options and result type surface", () => {
    expectTypeOf<GcsTraitCalculationOptionsV5>().toEqualTypeOf<{
      readonly useMultiplicativeModifiers: boolean;
    }>();
    expectTypeOf<GcsTraitCalculationNodeV5>().not.toBeNever();
    expectTypeOf<GcsTraitCalculationV5>().toBeObject();
    expectTypeOf<GcsTraitContainerCalculationV5>().toBeObject();
  });

  it("narrows calculation nodes by kind", () => {
    const narrow = (node: GcsTraitCalculationNodeV5): void => {
      if (node.kind === "trait") {
        expectTypeOf(node).toEqualTypeOf<GcsTraitCalculationV5>();
      } else {
        expectTypeOf(node).toEqualTypeOf<GcsTraitContainerCalculationV5>();
      }
    };

    expectTypeOf(narrow).parameter(0).toEqualTypeOf<GcsTraitCalculationNodeV5>();
  });

  it("keeps children readonly and currentLevel off containers", () => {
    expectTypeOf<
      GcsTraitContainerCalculationV5["children"]
    >().toEqualTypeOf<readonly GcsTraitCalculationNodeV5[] | undefined>();
    expectTypeOf<
      HasKey<GcsTraitContainerCalculationV5, "currentLevel">
    >().toEqualTypeOf<false>();
  });
});
