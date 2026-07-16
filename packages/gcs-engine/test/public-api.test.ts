import { describe, expect, it } from "vitest";

import { GCS_DATA_VERSION, parseGcsV5, serializeGcsV5 } from "@gcs/gcs-engine";

describe("@gcs/gcs-engine public API", () => {
  it("resolves from source before package build", () => {
    const document = parseGcsV5('{"version":5}');

    expect(GCS_DATA_VERSION).toBe(5);
    expect(serializeGcsV5(document)).toBe('{\n\t"version": 5\n}\n');
  });
});
