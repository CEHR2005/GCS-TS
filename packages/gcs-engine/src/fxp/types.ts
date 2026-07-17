declare const fxpBrand: unique symbol;

export type Fxp = bigint & { readonly [fxpBrand]: "Fxp" };

export const FXP_SCALE = 10_000n;
export const FXP_MIN_RAW = -(1n << 63n);
export const FXP_MAX_RAW = (1n << 63n) - 1n;
