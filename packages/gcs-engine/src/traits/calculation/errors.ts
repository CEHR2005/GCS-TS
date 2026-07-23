export type GcsTraitCalculationErrorCode =
  "INVALID_OPTIONS" | "CYCLE_DETECTED" | "MAX_DEPTH_EXCEEDED";

export class GcsTraitCalculationError extends Error {
  readonly code: GcsTraitCalculationErrorCode;
  readonly path: string;

  constructor(
    code: GcsTraitCalculationErrorCode,
    message: string,
    path: string,
  ) {
    super(message);
    this.name = "GcsTraitCalculationError";
    this.code = code;
    this.path = path;
  }
}
