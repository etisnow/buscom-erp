import "dotenv/config";

/**
 * Серверные модули валидируют переменные окружения при импорте (`src/server/env.ts`),
 * поэтому файл с тестами падал бы ещё до того, как решится пропускать его или нет.
 * Подставляем заглушки для всего, чего нет: тестам без БД настоящие значения не нужны,
 * а `resetDb` всё равно откажется работать с базой, в имени которой нет «test».
 */
process.env.DATABASE_URL ??= "postgresql://placeholder:placeholder@localhost:5432/placeholder";
process.env.BETTER_AUTH_SECRET ??= "placeholder-secret-placeholder-secret-x";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.SITE_WEBHOOK_SECRET ??= "placeholder-webhook-placeholder-webhook";
