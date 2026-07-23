import { describe, expect, it } from "vitest";

import {
  calculateGcsTraitPointsV5,
  fxpFromInteger,
  GcsTraitCalculationError,
  type GcsTraitContainerV5,
  type GcsTraitNodeV5,
  parseTid,
  type Tid,
} from "@gcs/gcs-engine";

const options = { useMultiplicativeModifiers: false } as const;
const raw = fxpFromInteger;
const traitId = parseTid("tAAECAwQFBgcICQoL");
const otherTraitId = parseTid("tAQECAwQFBgcICQoL");
const thirdTraitId = parseTid("tAgECAwQFBgcICQoL");
const containerId = parseTid("TAAECAwQFBgcICQoL");
const otherContainerId = parseTid("TAQECAwQFBgcICQoL");
const modifierId = parseTid("mAAECAwQFBgcICQoL");

const leaf = (
  id: Tid = traitId,
  points = 1n,
  extra: Partial<Extract<GcsTraitNodeV5, { kind: "trait" }>> = {},
): Extract<GcsTraitNodeV5, { kind: "trait" }> => ({
  kind: "trait",
  id,
  basePoints: raw(points),
  ...extra,
});

const container = (
  children?: readonly GcsTraitNodeV5[],
  extra: Partial<GcsTraitContainerV5> = {},
): GcsTraitContainerV5 => ({
  kind: "trait_container",
  id: containerId,
  ...(children === undefined ? {} : { children }),
  ...extra,
});

describe("trait tree calculation", () => {
  it("validates options before handling absent or empty roots", () => {
    expect(calculateGcsTraitPointsV5(undefined, options)).toBeUndefined();
    const empty = calculateGcsTraitPointsV5([], options);
    expect(empty).toEqual([]);
    expect(Object.isFrozen(empty)).toBe(true);

    for (const invalid of [{}, { useMultiplicativeModifiers: "false" }]) {
      for (const traits of [undefined, []] as const) {
        expect(() =>
          calculateGcsTraitPointsV5(traits, invalid as never),
        ).toThrowError(
          expect.objectContaining({
            name: "GcsTraitCalculationError",
            code: "INVALID_OPTIONS",
            path: "/options/useMultiplicativeModifiers",
          }),
        );
      }
    }
  });

  it("preserves absent and empty children and sums regular containers", () => {
    const result = calculateGcsTraitPointsV5(
      [
        container(),
        container([], { id: otherContainerId }),
        container([leaf(), leaf(otherTraitId, 2n)]),
      ],
      options,
    );
    expect(result?.[0]).toEqual({
      kind: "trait_container",
      id: containerId,
      adjustedPoints: raw(0n),
    });
    expect(result?.[1]).toEqual({
      kind: "trait_container",
      id: otherContainerId,
      adjustedPoints: raw(0n),
      children: [],
    });
    expect(result?.[2]?.adjustedPoints).toBe(raw(3n));
    expect(result?.[1]?.kind).toBe("trait_container");
    if (result?.[1]?.kind !== "trait_container") throw new Error("container");
    expect(Object.isFrozen(result[1].children)).toBe(true);
  });

  it.each([
    ["ties", [leaf(traitId, 10n), leaf(otherTraitId, 10n)], 12n],
    ["zero", [leaf(traitId, 0n), leaf(otherTraitId, 10n)], 10n],
    ["all-negative", [leaf(traitId, -4n), leaf(otherTraitId, -6n)], -1n],
    [
      "per-child ceiling",
      [leaf(traitId, 10n), leaf(otherTraitId, 1n), leaf(thirdTraitId, 1n)],
      12n,
    ],
  ])("aggregates alternative abilities for %s", (_name, children, expected) => {
    const result = calculateGcsTraitPointsV5(
      [container(children, { containerType: "alternative_abilities" })],
      options,
    );
    expect(result?.[0]?.adjustedPoints).toBe(raw(expected));
  });

  it("propagates disabled state while retaining the full tree", () => {
    const result = calculateGcsTraitPointsV5(
      [container([container([leaf(traitId, 10n)])], { disabled: true })],
      options,
    );
    expect(result?.[0]?.adjustedPoints).toBe(raw(0n));
    expect(result?.[0]?.kind).toBe("trait_container");
    if (result?.[0]?.kind !== "trait_container") throw new Error("container");
    expect(result[0].children?.[0]?.adjustedPoints).toBe(raw(0n));
  });

  it("inherits modifiers from the nearest container outward", () => {
    const modifier = {
      kind: "trait_modifier" as const,
      id: modifierId,
      costAdjustment: "+2",
    };
    const result = calculateGcsTraitPointsV5(
      [
        container([container([leaf(traitId, 1n)], { modifiers: [modifier] })], {
          modifiers: [modifier],
        }),
      ],
      options,
    );
    expect(result?.[0]?.adjustedPoints).toBe(raw(5n));
  });

  it("preserves order and TIDs, deeply freezes output, and does not mutate input", () => {
    const input = [container([leaf(otherTraitId, 2n), leaf(traitId, 1n)])];
    const before = structuredClone(input);
    const result = calculateGcsTraitPointsV5(input, options)!;
    expect(result[0]?.id).toBe(containerId);
    expect(result[0]?.kind).toBe("trait_container");
    if (result[0]?.kind !== "trait_container") throw new Error("container");
    expect(result[0].children?.map(({ id }) => id)).toEqual([
      otherTraitId,
      traitId,
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0])).toBe(true);
    expect(Object.isFrozen(result[0].children)).toBe(true);
    expect(Object.isFrozen(result[0].children?.[0])).toBe(true);
    expect(input).toEqual(before);
    expect(result).not.toBe(input);
  });

  it("reports a cycle at the exact source-compatible pointer", () => {
    const cyclic = container([]) as GcsTraitContainerV5 & {
      children: GcsTraitNodeV5[];
    };
    cyclic.children.push(cyclic);
    expect(() => calculateGcsTraitPointsV5([cyclic], options)).toThrowError(
      expect.objectContaining({
        code: "CYCLE_DETECTED",
        path: "/traits/0/children/0",
      }),
    );
  });

  it("allows depth 256 and rejects attempted depth 257 at its exact pointer", () => {
    const build = (depth: number): GcsTraitNodeV5 => {
      let node: GcsTraitNodeV5 = leaf();
      for (let current = 1; current < depth; current += 1) {
        node = container([node]);
      }
      return node;
    };
    expect(calculateGcsTraitPointsV5([build(256)], options)).toBeDefined();
    const pointer = `/traits/0${"/children/0".repeat(256)}`;
    expect(() => calculateGcsTraitPointsV5([build(257)], options)).toThrowError(
      expect.objectContaining({ code: "MAX_DEPTH_EXCEEDED", path: pointer }),
    );
  });

  it("permits shared nodes in separate branches and returns independent results", () => {
    const shared = container([leaf()]);
    const result = calculateGcsTraitPointsV5(
      [container([shared]), container([shared], { id: otherContainerId })],
      options,
    )!;
    if (
      result[0]?.kind !== "trait_container" ||
      result[1]?.kind !== "trait_container"
    )
      throw new Error("containers");
    expect(result[0].children?.[0]).toEqual(result[1].children?.[0]);
    expect(result[0].children?.[0]).not.toBe(result[1].children?.[0]);
  });

  it("exports its stable public error class", () => {
    expect(GcsTraitCalculationError.prototype).toBeInstanceOf(Error);
  });
});
