import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" keeps the static build portable (GitHub Pages sub-path or any host)
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
