import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": process.env.API_URL ?? "http://localhost:8080",
    },
  },
});
