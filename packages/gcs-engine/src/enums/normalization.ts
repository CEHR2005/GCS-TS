export type GcsEnumDiagnosticCode = "LEGACY_ALIAS" | "FALLBACK_DEFAULT";

export type GcsEnumNormalization<T extends string | number> = {
  value: T;
  diagnostic?: {
    code: GcsEnumDiagnosticCode;
    input: string | number;
    canonical: T;
  };
};
