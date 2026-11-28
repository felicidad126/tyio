import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                // React jarang berubah: berkasnya terpisah supaya tetap
                // tersimpan di browser walaupun kode aplikasi diperbarui.
                {
                  name: "react",
                  test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                },
              ],
            },
          },
        },
      },
    },
  },
});
