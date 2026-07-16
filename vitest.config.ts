import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@gcs/gcs-engine": resolve(__dirname, "packages/gcs-engine/src/index.ts"),
    },
  },
  test: {
    environment: "node",
  },
});
