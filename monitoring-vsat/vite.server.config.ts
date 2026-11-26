import { defineConfig } from "vite";

// Build server Node.js (server/main.ts dan server/setup.ts) menjadi berkas
// JavaScript tunggal di dist/server. Hanya memakai modul bawaan Node.
export default defineConfig({
  build: {
    ssr: true,
    outDir: "dist/server",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      input: {
        main: "server/main.ts",
        setup: "server/setup.ts",
        cadangan: "server/cadangan.ts",
      },
      external: [/^node:/],
      output: { format: "es", entryFileNames: "[name].js" },
    },
  },
  ssr: { target: "node", noExternal: true },
});
