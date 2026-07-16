import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type FixtureManifest = {
  sourceRepository: string;
  sourceTag: string;
  license: string;
  fixtures: Array<{
    file: string;
    upstreamPath: string;
    sha256: string;
  }>;
};

const fixturesDirectory = resolve("fixtures/gcs-v5");
const manifest = JSON.parse(
  readFileSync(resolve(fixturesDirectory, "manifest.json"), "utf8"),
) as FixtureManifest;

const expectedFixtures = [
  {
    file: "wang-laowu.gcs",
    upstreamPath: "Library/Thaumatology/Wang Laowu.gcs",
    sha256: "5fa73a3fdb65ae4e1780a4b50775bdd44eb010ddd3e315dce9b21eab53f4be55",
  },
  {
    file: "dragon-large-fire.gcs",
    upstreamPath:
      "Library/Dungeon Fantasy RPG/Monsters/Dragons/Dragon, Large, Fire.gcs",
    sha256: "929fb9b49af4ccf3b384e38f35e066c7b90b068a2030c6a86cd93519f19cd5a3",
  },
  {
    file: "lich.gcs",
    upstreamPath: "Library/Dungeon Fantasy RPG/Monsters/Lich.gcs",
    sha256: "2176a0d593f20dc694a9530cee70c8909c1885f4654dfa071b0c5aa93b25fdd8",
  },
] as const;

describe("curated GCS v5 fixture provenance", () => {
  it("pins the expected upstream release and license", () => {
    expect(manifest).toMatchObject({
      sourceRepository: "richardwilkes/gcs_master_library",
      sourceTag: "v5.12.0",
      license: "MPL-2.0",
    });
    expect(manifest.fixtures).toEqual(expectedFixtures);
  });

  it.each(manifest.fixtures)(
    "verifies $file byte-for-byte",
    async (fixture) => {
      expect(fixture.upstreamPath).toMatch(/^Library\//);
      const bytes = await readFile(resolve(fixturesDirectory, fixture.file));
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(digest).toBe(fixture.sha256);
    },
  );
});
