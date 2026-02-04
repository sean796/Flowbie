import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
// For WP Engine subdirectory deploy (e.g. flowbie.ca/app/): set VITE_BASE_PATH=/app/
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Proxy MCP API calls to backend server
      '/api/mcp': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // Proxy WordPress API calls to backend server
      '/api/wordpress': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
