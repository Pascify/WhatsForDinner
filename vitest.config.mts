import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = { "@": path.resolve(import.meta.dirname, "src") };

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/data/**"],
      // json-summary and json feed the pull request comment; text prints in the log.
      reporter: ["text-summary", "json-summary", "json"],
      reportOnFailure: true,
    },
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
