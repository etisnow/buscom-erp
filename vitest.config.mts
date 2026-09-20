import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` бросает ошибку вне серверной среды Next. В тестах подменяем
      // пустым модулем, иначе нельзя тестировать ничего из src/server.
      "server-only": new URL("./src/test/server-only-stub.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    setupFiles: ["src/test/setup.ts"],
    // Тесты по живой БД чистят её через TRUNCATE (см. src/test/db.ts) и мешают друг
    // другу, если файлы идут параллельно: взаимоблокировка и чужие данные в выборке.
    // При RUN_DB_TESTS=1 файлы идут по очереди; обычный прогон остаётся параллельным.
    fileParallelism: process.env.RUN_DB_TESTS !== "1",
  },
});
