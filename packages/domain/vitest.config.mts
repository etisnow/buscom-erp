import { defineConfig } from "vitest/config";

// Домен без БД и окружения — тестам не нужны ни заглушки, ни живая база.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
