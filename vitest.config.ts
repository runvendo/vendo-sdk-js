import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environmentMatchGlobs: [
      // Browser source tests run under happy-dom for DOM APIs
      ["src/browser/**", "happy-dom"],
    ],
  },
});
