import { FXP_MAX_RAW, FXP_MIN_RAW } from "@gcs/gcs-engine";

export const FXP_VECTOR_SEED = 0x4743535f465850n;

export type FxpPairVector = {
  index: number;
  left: bigint;
  right: bigint;
};

const MULTIPLIER = 6_364_136_223_846_793_005n;
const INCREMENT = 1_442_695_040_888_963_407n;

export function makeFxpPairVectors(count = 256): readonly FxpPairVector[] {
  let state = FXP_VECTOR_SEED;
  const next = (): bigint => {
    state = BigInt.asUintN(64, state * MULTIPLIER + INCREMENT);
    return BigInt.asIntN(64, state);
  };
  return Array.from({ length: count }, (_, index) => {
    const left = next();
    const candidate = next();
    return { index, left, right: candidate === 0n ? 1n : candidate };
  });
}

export const FXP_BOUNDARY_VALUES = Object.freeze([
  FXP_MIN_RAW,
  FXP_MIN_RAW + 1n,
  -20_001n,
  -20_000n,
  -15_001n,
  -15_000n,
  -14_999n,
  -10_001n,
  -10_000n,
  -9_999n,
  -5_001n,
  -5_000n,
  -4_999n,
  -1n,
  0n,
  1n,
  4_999n,
  5_000n,
  5_001n,
  9_999n,
  10_000n,
  10_001n,
  14_999n,
  15_000n,
  15_001n,
  20_000n,
  20_001n,
  FXP_MAX_RAW - 1n,
  FXP_MAX_RAW,
]);
