export const GCS_TRAIT_PROJECTION_MAX_DEPTH = 256 as const;

export type GcsTraitProjectionErrorCode =
  | "INVALID_TRAITS"
  | "INVALID_TRAIT"
  | "INVALID_TRAIT_MODIFIER"
  | "INVALID_FIELD"
  | "INVALID_NODE_KIND"
  | "INVALID_CONTAINER_SHAPE"
  | "UNSAFE_FXP_NUMBER"
  | "CYCLE_DETECTED"
  | "MAX_DEPTH_EXCEEDED";

export class GcsTraitProjectionError extends Error {
  readonly code: GcsTraitProjectionErrorCode;
  readonly path: string;

  constructor(
    code: GcsTraitProjectionErrorCode,
    message: string,
    path: string,
  ) {
    super(message);
    this.name = "GcsTraitProjectionError";
    this.code = code;
    this.path = path;
  }
}
