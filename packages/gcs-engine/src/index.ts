export { GcsParseError, type GcsParseErrorCode } from "./errors.js";
export {
  absFxp,
  addFxp,
  applyFxpRounding,
  ceilFxp,
  divideFxp,
  floorFxp,
  formatFxp,
  FXP_MAX_RAW,
  FXP_MIN_RAW,
  FXP_SCALE,
  fxpFromInteger,
  fxpFromRaw,
  fxpToRaw,
  maxFxp,
  minFxp,
  moduloFxp,
  multiplyFxp,
  parseFxp,
  roundFxp,
  subtractFxp,
  truncateFxp,
  type Fxp,
} from "./fxp/index.js";
export { parseGcsV5 } from "./parse.js";
export {
  GcsPrimitiveError,
  type GcsPrimitiveErrorCode,
} from "./primitive-errors.js";
export { serializeGcsV5 } from "./serialize.js";
export {
  assertTidKind,
  generateTid,
  getTidKind,
  isTid,
  parseTid,
  type Tid,
  type TidKind,
  type TidRandomSource,
} from "./tid/index.js";
export {
  GCS_DATA_VERSION,
  type GcsDocumentV5,
  type JsonValue,
} from "./types.js";
