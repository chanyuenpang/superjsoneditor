import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
    lib: {
      entry: "src/index.ts",
      fileName: "index",
      formats: ["es"],
      name: "SuperJsonEditor",
      cssFileName: "styles",
    },
    rollupOptions: {
      external: ["react", "react-dom"],
    },
  },
});
