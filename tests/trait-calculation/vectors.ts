const T = "tAAECAwQFBgcICQoL";
const C = "TAAECAwQFBgcICQoL";
const M = "mAAECAwQFBgcICQoL";
const MC = "MAAECAwQFBgcICQoL";

export type TraitCalculationVector = Readonly<{ id: string; document: string }>;

function document(traits: readonly Record<string, unknown>[]): string {
  return JSON.stringify({ version: 5, traits });
}
function trait(fields: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: T,
    base_points: 10,
    can_level: true,
    points_per_level: 2,
    levels: 3,
    ...fields,
  };
}
function modifier(
  cost_adj: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return { id: M, cost_adj, ...fields };
}

export const TRAIT_CALCULATION_VECTORS: readonly TraitCalculationVector[] =
  Object.freeze([
    { id: "absent-values", document: document([{ id: T }]) },
    { id: "disabled-leaf", document: document([trait({ disabled: true })]) },
    {
      id: "additions-affects",
      document: document([
        trait({
          modifiers: [
            modifier("+2", { affects: "total" }),
            modifier("+3", { affects: "base_only" }),
            modifier("+4", { affects: "levels_only" }),
          ],
        }),
      ]),
    },
    {
      id: "percentages-floor",
      document: document([
        trait({
          modifiers: [
            modifier("+25%"),
            modifier("-90%"),
            modifier("+10%", { affects: "levels_only" }),
          ],
        }),
      ]),
    },
    {
      id: "multipliers-markers",
      document: document([
        trait({
          modifiers: [modifier("x50%"), modifier("x2/3"), modifier("1.5x")],
        }),
      ]),
    },
    {
      id: "permissive-adjustments",
      document: document([
        trait({
          modifiers: [
            modifier("+2 points"),
            modifier("-"),
            modifier("x1/0"),
            modifier("x-2"),
            modifier("x-50%"),
          ],
        }),
      ]),
    },
    {
      id: "leveled-modifiers",
      document: document([
        trait({
          modifiers: [
            modifier("+10%", { use_level_from_trait: true }),
            modifier("+1", { levels: 2 }),
          ],
        }),
      ]),
    },
    {
      id: "control-frequency-rounding",
      document: document([trait({ cr: 12, frequency: 9, round_down: true })]),
    },
    {
      id: "nested-disabled-modifiers",
      document: document([
        trait({
          modifiers: [
            {
              id: MC,
              children: [modifier("+4"), modifier("+99", { disabled: true })],
            },
          ],
        }),
      ]),
    },
    {
      id: "inherited-modifiers",
      document: document([
        {
          id: C,
          modifiers: [modifier("+25%")],
          children: [trait({ modifiers: [modifier("+2")] })],
        },
      ]),
    },
    {
      id: "disabled-container",
      document: document([{ id: C, disabled: true, children: [trait()] }]),
    },
    {
      id: "regular-container",
      document: document([
        {
          id: C,
          children: [
            trait(),
            trait({ id: "tAQECAwQFBgcICQoL", base_points: -2, levels: 0 }),
          ],
        },
      ]),
    },
    {
      id: "alternative-tie-zero-negative",
      document: document([
        {
          id: C,
          container_type: "alternative_abilities",
          children: [
            trait({ base_points: 10, levels: 0 }),
            trait({ id: "tAQECAwQFBgcICQoL", base_points: 10, levels: 0 }),
            trait({ id: "tAgECAwQFBgcICQoL", base_points: 0, levels: 0 }),
            trait({ id: "tAwECAwQFBgcICQoL", base_points: -3, levels: 0 }),
          ],
        },
      ]),
    },
    {
      id: "alternative-all-negative",
      document: document([
        {
          id: C,
          container_type: "alternative_abilities",
          children: [
            trait({ base_points: -2, levels: 0 }),
            trait({ id: "tAQECAwQFBgcICQoL", base_points: -7, levels: 0 }),
          ],
        },
      ]),
    },
  ]);
