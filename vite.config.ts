import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base './' so the packaged Electron build works over the file:// protocol.
// Dev server URL (port 1420, strictPort) is what Electron loads during development.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});
