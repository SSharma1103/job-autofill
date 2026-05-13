import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: dirname,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(dirname, "src/background.ts"),
        content: resolve(dirname, "src/content.ts"),
        devtools: resolve(dirname, "src/devtools/devtools.html"),
        devtoolsPanel: resolve(dirname, "src/devtools/panel.html"),
        popup: resolve(dirname, "src/popup/popup.html"),
        options: resolve(dirname, "src/options/options.html"),
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]",
      },
    },
  },
  plugins: [
    {
      name: "copy-extension-manifest",
      closeBundle() {
        mkdirSync(resolve(dirname, "dist"), { recursive: true });
        copyFileSync(resolve(dirname, "manifest.json"), resolve(dirname, "dist/manifest.json"));
      },
    },
  ],
});
