export const GCS_DATA_VERSION = 5 as const;

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type GcsDocumentV5 = {
  version: typeof GCS_DATA_VERSION;
  [key: string]: JsonValue;
};
