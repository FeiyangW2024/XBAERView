import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/data": {
        target: "http://127.0.0.1:8765",
        rewrite: (p) => p.replace(/^\/data/, ""),
      },
    },
  },
  preview: {
    proxy: {
      "/data": {
        target: "http://127.0.0.1:8765",
        rewrite: (p) => p.replace(/^\/data/, ""),
      },
    },
  },
});
