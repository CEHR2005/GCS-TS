import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  parseGcsV5,
  projectGcsTraitsV5,
  serializeGcsV5,
  type GcsTraitModifierNodeV5,
  type GcsTraitNodeV5,
} from "@gcs/gcs-engine";

const fixturesDirectory = new URL("../../../fixtures/gcs-v5/", import.meta.url);

type FixtureManifest = {
  readonly fixtures: readonly { readonly file: string }[];
};

type NodeKind =
  "trait" | "trait_container" | "trait_modifier" | "trait_modifier_container";

type CorpusCounts = Record<NodeKind, number> & {
  nestedChildren: number;
};

function collectObjectReferences(
  value: unknown,
  references = new Set<object>(),
): ReadonlySet<object> {
  if (value === null || typeof value !== "object" || references.has(value)) {
    return references;
  }

  references.add(value);
  for (const child of Object.values(value)) {
    collectObjectReferences(child, references);
  }
  return references;
}

function expectDeepFrozenWithoutInputAliases(
  value: unknown,
  inputReferences: ReadonlySet<object>,
  visited = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || visited.has(value)) return;

  visited.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  expect(inputReferences.has(value)).toBe(false);
  for (const child of Object.values(value)) {
    expectDeepFrozenWithoutInputAliases(child, inputReferences, visited);
  }
}

function countModifierNodes(
  node: GcsTraitModifierNodeV5,
  counts: CorpusCounts,
): void {
  counts[node.kind] += 1;
  if (node.kind === "trait_modifier_container") {
    counts.nestedChildren += node.children?.length ?? 0;
    node.children?.forEach((child) => countModifierNodes(child, counts));
  }
}

function countTraitNodes(node: GcsTraitNodeV5, counts: CorpusCounts): void {
  counts[node.kind] += 1;
  node.modifiers?.forEach((modifier) => countModifierNodes(modifier, counts));
  if (node.kind === "trait_container") {
    counts.nestedChildren += node.children?.length ?? 0;
    node.children?.forEach((child) => countTraitNodes(child, counts));
  }
}

describe("committed GCS v5 trait fixtures", () => {
  it("projects every fixture immutably and covers the complete node corpus", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("manifest.json", fixturesDirectory), "utf8"),
    ) as FixtureManifest;
    const counts: CorpusCounts = {
      trait: 0,
      trait_container: 0,
      trait_modifier: 0,
      trait_modifier_container: 0,
      nestedChildren: 0,
    };

    for (const fixture of manifest.fixtures) {
      const original = await readFile(
        new URL(fixture.file, fixturesDirectory),
        "utf8",
      );
      const document = parseGcsV5(original);
      const before = structuredClone(document);
      const inputReferences = collectObjectReferences(document);

      const projected = projectGcsTraitsV5(document);

      expect(projected).toBeDefined();
      expect(projected?.length).toBeGreaterThan(0);
      expect(document).toEqual(before);
      expect(serializeGcsV5(document)).toBe(serializeGcsV5(before));
      expectDeepFrozenWithoutInputAliases(projected, inputReferences);
      projected?.forEach((node) => countTraitNodes(node, counts));
    }

    expect(counts.trait).toBeGreaterThan(0);
    expect(counts.trait_container).toBeGreaterThan(0);
    expect(counts.trait_modifier).toBeGreaterThan(0);
    expect(counts.trait_modifier_container).toBeGreaterThan(0);
    expect(counts.nestedChildren).toBeGreaterThan(0);
  });
});
