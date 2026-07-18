import { describe, expect, it } from "vitest";

import {
  fxpToRaw,
  GCS_DATA_VERSION,
  GCS_TRAIT_PROJECTION_MAX_DEPTH,
  GcsTraitProjectionError,
  parseGcsV5,
  projectGcsTraitsV5,
  serializeGcsV5,
} from "@gcs/gcs-engine";

const TRAIT_ID = "tAAECAwQFBgcICQoL";

describe("@gcs/gcs-engine public API", () => {
  it("resolves from source before package build", () => {
    const document = parseGcsV5('{"version":5}');

    expect(GCS_DATA_VERSION).toBe(5);
    expect(serializeGcsV5(document)).toBe('{\n\t"version": 5\n}\n');
  });

  it("exposes typed trait projection from the source package root", () => {
    const document = parseGcsV5(
      `{"version":5,"traits":[{"id":"${TRAIT_ID}","base_points":1.25}]}`,
    );

    const projected = projectGcsTraitsV5(document);

    expect(GCS_TRAIT_PROJECTION_MAX_DEPTH).toBe(256);
    expect(GcsTraitProjectionError.prototype).toBeInstanceOf(Error);
    expect(projected?.[0]).toMatchObject({ kind: "trait", id: TRAIT_ID });
    expect(projected?.[0]?.kind).toBe("trait");
    if (projected?.[0]?.kind !== "trait") {
      throw new Error("expected a projected trait leaf");
    }
    expect(fxpToRaw(projected[0].basePoints!)).toBe(12_500n);
  });
});
