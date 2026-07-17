export type GcsPrimitiveErrorCode =
  | "INVALID_FXP"
  | "FXP_OUT_OF_RANGE"
  | "DIVIDE_BY_ZERO"
  | "INVALID_TID"
  | "INVALID_TID_KIND"
  | "INVALID_ENUM"
  | "CRYPTO_UNAVAILABLE";

export class GcsPrimitiveError extends Error {
  readonly code: GcsPrimitiveErrorCode;
  readonly path?: string;

  constructor(code: GcsPrimitiveErrorCode, message: string, path?: string) {
    super(message);
    this.name = "GcsPrimitiveError";
    this.code = code;
    if (path !== undefined) this.path = path;
  }
}
