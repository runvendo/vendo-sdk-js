import { defineConfig } from "tsup";

export default defineConfig([
  // Main SDK entry — CommonJS + ESM for Node.js consumers
  {
    entry: { index: "src/index.ts" },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    target: "es2022",
    outDir: "dist",
  },
  // Browser Web Components entry — ESM only (targets modern browsers, no framework deps)
  {
    entry: { "browser/index": "src/browser/index.ts" },
    format: ["esm"],
    dts: true,
    clean: false,
    target: "es2022",
    outDir: "dist",
  },
]);
