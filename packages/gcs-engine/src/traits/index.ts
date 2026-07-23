export {
  calculateGcsTraitPointsV5,
  GcsTraitCalculationError,
  type GcsTraitCalculationErrorCode,
  type GcsTraitCalculationNodeV5,
  type GcsTraitCalculationOptionsV5,
  type GcsTraitCalculationV5,
  type GcsTraitContainerCalculationV5,
} from "./calculation/index.js";
export {
  GCS_TRAIT_PROJECTION_MAX_DEPTH,
  GcsTraitProjectionError,
  type GcsTraitProjectionErrorCode,
} from "./errors.js";
export { projectGcsTraitsV5 } from "./project.js";
export type {
  GcsReadonlyJsonObject,
  GcsReadonlyJsonValue,
  GcsSourceV5,
  GcsStudyV5,
  GcsTraitContainerV5,
  GcsTraitModifierContainerV5,
  GcsTraitModifierNodeV5,
  GcsTraitModifierV5,
  GcsTraitNodeV5,
  GcsTraitV5,
} from "./types.js";
