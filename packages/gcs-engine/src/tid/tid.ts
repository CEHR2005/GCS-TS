import { GcsPrimitiveError } from "../primitive-errors.js";

declare const tidBrand: unique symbol;

export type Tid = string & { readonly [tidBrand]: "Tid" };
export type TidKind = "t" | "T" | "m" | "M";
export type TidRandomSource = () => Uint8Array;

const PAYLOAD = /^[A-Za-z0-9_-]{16}$/;
const KIND = /^[A-Za-z0-9]$/;
const KINDS = new Set<string>(["t", "T", "m", "M"]);
const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const RANDOM_BYTE_COUNT = 12;
const TYPED_ARRAY_TAG_GETTER = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype) as object,
  Symbol.toStringTag,
)?.get;

function isTidKind(value: string): value is TidKind {
  return KINDS.has(value);
}

function defaultRandomSource(): Uint8Array {
  const crypto = globalThis.crypto;
  const getRandomValues = crypto?.getRandomValues;
  if (typeof getRandomValues !== "function") {
    throw new GcsPrimitiveError(
      "CRYPTO_UNAVAILABLE",
      "cryptographic randomness is unavailable",
    );
  }

  const bytes = new Uint8Array(RANDOM_BYTE_COUNT);
  getRandomValues.call(crypto, bytes);
  return bytes;
}

function isUint8Array(value: unknown): value is Uint8Array {
  return (
    ArrayBuffer.isView(value) &&
    typeof TYPED_ARRAY_TAG_GETTER === "function" &&
    Reflect.apply(TYPED_ARRAY_TAG_GETTER, value, []) === "Uint8Array"
  );
}

function encodePayload(bytes: Uint8Array): string {
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1]!;
    const third = bytes[index + 2]!;
    result += ALPHABET[first >> 2]!;
    result += ALPHABET[((first & 0x03) << 4) | (second >> 4)]!;
    result += ALPHABET[((second & 0x0f) << 2) | (third >> 6)]!;
    result += ALPHABET[third & 0x3f]!;
  }
  return result;
}

export function parseTid(input: string): Tid {
  if (typeof input !== "string") {
    throw new GcsPrimitiveError(
      "INVALID_TID",
      "invalid TID: expected a string",
    );
  }
  const kind = input[0] ?? "";
  if (
    input.length !== 17 ||
    !KIND.test(kind) ||
    !PAYLOAD.test(input.slice(1))
  ) {
    throw new GcsPrimitiveError("INVALID_TID", `invalid TID: ${input}`);
  }
  if (!isTidKind(kind)) {
    throw new GcsPrimitiveError(
      "INVALID_TID_KIND",
      `unsupported TID kind: ${kind}`,
    );
  }
  return input as Tid;
}

export function isTid(input: string): input is Tid {
  try {
    parseTid(input);
    return true;
  } catch (error) {
    if (error instanceof GcsPrimitiveError) return false;
    throw error;
  }
}

export function getTidKind(tid: Tid): TidKind {
  return tid[0] as TidKind;
}

export function assertTidKind(tid: Tid, expected: TidKind): void {
  const actual = getTidKind(tid);
  if (actual !== expected) {
    throw new GcsPrimitiveError(
      "INVALID_TID_KIND",
      `expected TID kind ${expected}, received ${actual}`,
    );
  }
}

export function generateTid(
  kind: TidKind,
  randomSource: TidRandomSource = defaultRandomSource,
): Tid {
  if (!isTidKind(kind)) {
    throw new GcsPrimitiveError(
      "INVALID_TID_KIND",
      `unsupported TID kind: ${kind}`,
    );
  }
  const bytes = randomSource();
  if (!isUint8Array(bytes) || bytes.length !== RANDOM_BYTE_COUNT) {
    throw new GcsPrimitiveError(
      "CRYPTO_UNAVAILABLE",
      `TID random source must provide exactly ${RANDOM_BYTE_COUNT} bytes`,
    );
  }
  return `${kind}${encodePayload(bytes)}` as Tid;
}
