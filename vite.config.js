import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const projectRoot = fileURLToPath(new URL("./client", import.meta.url));

export default defineConfig({
  root: projectRoot,
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
