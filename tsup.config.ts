import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  // Bundle all local src/* into a single dist/index.js; keep node_modules external
  external: [
    "@anthropic-ai/sdk",
    "chalk",
    "cli-table3",
    "commander",
    "conf",
    "ora",
  ],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
