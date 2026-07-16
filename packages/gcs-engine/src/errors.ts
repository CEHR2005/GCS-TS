export type GcsParseErrorCode =
  | "INVALID_UTF8"
  | "INVALID_JSON"
  | "ROOT_NOT_OBJECT"
  | "MISSING_VERSION"
  | "UNSUPPORTED_VERSION";

export class GcsParseError extends Error {
  readonly code: GcsParseErrorCode;
  readonly path?: string;

  constructor(code: GcsParseErrorCode, message: string, path?: string) {
    super(message);
    this.name = "GcsParseError";
    this.code = code;

    if (path !== undefined) {
      this.path = path;
    }
  }
}
