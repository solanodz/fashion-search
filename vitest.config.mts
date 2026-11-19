import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside React Server Components; tests run in plain Node.
      "server-only": fileURLToPath(
        new URL("./src/test/empty-module.ts", import.meta.url),
      ),
    },
  },
  test: {
    // Load .env, .env.local, etc. (all keys, not only VITE_ ones).
    env: loadEnv(mode, process.cwd(), ""),
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.ts", "src/**/*.model.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "model",
          environment: "node",
          include: ["src/**/*.model.test.ts"],
          testTimeout: 300_000,
        },
      },
    ],
  },
}));
