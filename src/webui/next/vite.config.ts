import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Served by lighttpd under /webui/next/ (a static prefix of the CCU web root, see
// .migration/plan/decisions-ui.md D5). `npm run dev` proxies the API to a CCU:
//   CCU_URL=http://127.0.0.1:18080 npm run dev
export default defineConfig({
  base: "/webui/next/",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist", emptyOutDir: true },
  server: { proxy: { "/api": process.env.CCU_URL ?? "http://127.0.0.1:18080", "/pages": process.env.CCU_URL ?? "http://127.0.0.1:18080", "/webui/js": process.env.CCU_URL ?? "http://127.0.0.1:18080" } },
  test: { environment: "node" },
});
