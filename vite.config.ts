import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/web",
    emptyOutDir: false
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3000"
    }
  }
});
