import {
  addFxp,
  ceilFxp,
  fxpFromInteger,
  multiplyFxp,
  type Fxp,
} from "../../fxp/index.js";
import type {
  GcsTraitContainerV5,
  GcsTraitModifierNodeV5,
  GcsTraitNodeV5,
} from "../types.js";
import { GcsTraitCalculationError } from "./errors.js";
import { calculateLeafTrait } from "./leaf.js";
import type {
  GcsTraitCalculationNodeV5,
  GcsTraitCalculationOptionsV5,
  GcsTraitContainerCalculationV5,
} from "./types.js";

const MAX_DEPTH = 256;
const ZERO = fxpFromInteger(0n);
const TWENTY_PERCENT = 2_000n as Fxp;

type TraversalContext = Readonly<{
  active: WeakSet<GcsTraitNodeV5>;
  effectivelyDisabled: boolean;
  inheritedModifiers: readonly GcsTraitModifierNodeV5[];
  options: GcsTraitCalculationOptionsV5;
}>;

function traversalError(
  code: "CYCLE_DETECTED" | "MAX_DEPTH_EXCEEDED",
  path: string,
): GcsTraitCalculationError {
  return new GcsTraitCalculationError(
    code,
    code === "CYCLE_DETECTED"
      ? "Trait tree contains a cycle"
      : `Trait tree exceeds maximum depth ${MAX_DEPTH}`,
    path,
  );
}

function sumChildren(
  children: readonly GcsTraitCalculationNodeV5[],
): Fxp {
  let total = ZERO;
  for (const child of children) total = addFxp(total, child.adjustedPoints);
  return total;
}

function alternativeTotal(
  children: readonly GcsTraitCalculationNodeV5[],
): Fxp {
  let maximum = ZERO;
  for (const child of children) {
    if (child.adjustedPoints > maximum) maximum = child.adjustedPoints;
  }

  let total = ZERO;
  let selected = false;
  for (const child of children) {
    if (!selected && child.adjustedPoints === maximum) {
      total = addFxp(total, child.adjustedPoints);
      selected = true;
    } else {
      total = addFxp(
        total,
        ceilFxp(multiplyFxp(child.adjustedPoints, TWENTY_PERCENT)),
      );
    }
  }
  return total;
}

function calculateContainer(
  container: GcsTraitContainerV5,
  context: TraversalContext,
  path: string,
  depth: number,
): GcsTraitContainerCalculationV5 {
  const effectivelyDisabled =
    context.effectivelyDisabled || (container.disabled ?? false);
  const inheritedModifiers = [
    ...(container.modifiers ?? []),
    ...context.inheritedModifiers,
  ];
  const children = container.children?.map((child, index) =>
    calculateNode(
      child,
      { ...context, effectivelyDisabled, inheritedModifiers },
      `${path}/children/${index}`,
      depth + 1,
    ),
  );
  if (children !== undefined) Object.freeze(children);

  const adjustedPoints = effectivelyDisabled
    ? ZERO
    : container.containerType === "alternative_abilities"
      ? alternativeTotal(children ?? [])
      : sumChildren(children ?? []);
  return Object.freeze({
    kind: "trait_container",
    id: container.id,
    adjustedPoints,
    ...(children === undefined ? {} : { children }),
  });
}

function calculateNode(
  node: GcsTraitNodeV5,
  context: TraversalContext,
  path: string,
  depth: number,
): GcsTraitCalculationNodeV5 {
  if (depth > MAX_DEPTH) {
    throw traversalError("MAX_DEPTH_EXCEEDED", path);
  }
  if (context.active.has(node)) {
    throw traversalError("CYCLE_DETECTED", path);
  }

  context.active.add(node);
  try {
    if (node.kind === "trait") {
      return calculateLeafTrait(node, {
        effectivelyDisabled:
          context.effectivelyDisabled || (node.disabled ?? false),
        inheritedModifiers: context.inheritedModifiers,
        useMultiplicativeModifiers:
          context.options.useMultiplicativeModifiers,
      });
    }
    return calculateContainer(node, context, path, depth);
  } finally {
    context.active.delete(node);
  }
}

export function calculateGcsTraitPointsV5(
  traits: readonly GcsTraitNodeV5[] | undefined,
  options: GcsTraitCalculationOptionsV5,
): readonly GcsTraitCalculationNodeV5[] | undefined {
  if (typeof options?.useMultiplicativeModifiers !== "boolean") {
    throw new GcsTraitCalculationError(
      "INVALID_OPTIONS",
      "useMultiplicativeModifiers must be a boolean",
      "/options/useMultiplicativeModifiers",
    );
  }
  if (traits === undefined) return undefined;

  const active = new WeakSet<GcsTraitNodeV5>();
  return Object.freeze(
    traits.map((node, index) =>
      calculateNode(
        node,
        {
          active,
          effectivelyDisabled: false,
          inheritedModifiers: [],
          options,
        },
        `/traits/${index}`,
        1,
      ),
    ),
  );
}
