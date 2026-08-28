import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Single file for npx — inline workspace SDK and runtime deps.
  noExternal: [/.*/],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
