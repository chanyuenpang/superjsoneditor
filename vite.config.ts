import { writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { DEMO_SOURCE_FILES_BY_LOCALE } from "./src/demo-sources/manifest";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "local-demo-source-save",
      configureServer(server) {
        server.middlewares.use("/__save-demo-sources", async (req, res) => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.end("Method Not Allowed");
            return;
          }

          try {
            const chunks: Uint8Array[] = [];
            for await (const chunk of req) {
              chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }

            const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              documents: Record<string, unknown>;
              locale?: "en" | "zh";
            };
            const sourceFiles = DEMO_SOURCE_FILES_BY_LOCALE[payload.locale ?? "en"];
            await Promise.all(
              Object.entries(sourceFiles).map(async ([sourceId, relativeFile]) => {
                if (!(sourceId in payload.documents)) return;
                const targetPath = path.resolve(server.config.root, relativeFile);
                await writeFile(targetPath, `${JSON.stringify(payload.documents[sourceId], null, 2)}\n`, "utf8");
                const modules = server.moduleGraph.getModulesByFile(targetPath);
                if (!modules) return;
                for (const module of modules) {
                  server.moduleGraph.invalidateModule(module);
                }
              }),
            );

            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "Unknown save error" }));
          }
        });
      },
    },
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
  },
});
