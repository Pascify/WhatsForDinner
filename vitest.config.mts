import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    projects: [
      {
        // Domain logic, stores and integration tests: plain Node, no DOM.
        resolve: { alias },
        test: {
          name: "node",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // Components render in jsdom. Named *.dom.test.tsx so the split is obvious.
        plugins: [react()],
        resolve: { alias },
        test: {
          name: "dom",
          include: ["src/**/*.dom.test.tsx"],
          environment: "jsdom",
          setupFiles: ["src/test/setup-dom.ts"],
        },
      },
    ],
  },
});
