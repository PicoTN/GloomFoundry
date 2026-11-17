import { defineConfig } from "vite";

// Builds the system into dist/, which is the folder Foundry loads
// (symlink it as Data/systems/gloomfoundry, see `npm run link`).
export default defineConfig(({ mode }) => ({
  publicDir: "public",
  base: "/systems/gloomfoundry/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: mode === "production",
    target: "es2022",
    lib: {
      entry: "src/gloomfoundry.ts",
      formats: ["es"],
      fileName: () => "gloomfoundry.mjs",
      cssFileName: "gloomfoundry",
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
}));
