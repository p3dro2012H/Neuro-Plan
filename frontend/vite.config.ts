import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://127.0.0.1:3000",
      "/sessoes": "http://127.0.0.1:3000",
      "/alertas": "http://127.0.0.1:3000",
      "/health": "http://127.0.0.1:3000",
      "/planejamento": "http://127.0.0.1:3000",
      "/planejamentos": "http://127.0.0.1:3000",
      "/tarefas": "http://127.0.0.1:3000",
      "/assistente": "http://127.0.0.1:3000",
    },
  },
});
