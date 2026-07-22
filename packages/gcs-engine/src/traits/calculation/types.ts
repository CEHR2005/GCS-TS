import type { Fxp } from "../../fxp/index.js";
import type { Tid } from "../../tid/index.js";

export type GcsTraitCalculationOptionsV5 = {
  readonly useMultiplicativeModifiers: boolean;
};

export type GcsTraitCalculationNodeV5 =
  GcsTraitCalculationV5 | GcsTraitContainerCalculationV5;

export type GcsTraitCalculationV5 = {
  readonly kind: "trait";
  readonly id: Tid;
  readonly currentLevel: Fxp;
  readonly adjustedPoints: Fxp;
};

export type GcsTraitContainerCalculationV5 = {
  readonly kind: "trait_container";
  readonly id: Tid;
  readonly adjustedPoints: Fxp;
  readonly children?: readonly GcsTraitCalculationNodeV5[];
};
