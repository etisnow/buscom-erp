import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// DATABASE_URL: из окружения (CI, контейнер миграций), иначе из .env рядом, иначе
// из .env ERP — на машине разработки он один на оба приложения (docs/DEV-DB.md).
config({ path: [path.join(__dirname, ".env"), path.join(__dirname, "../../apps/erp/.env")], quiet: true });

// Сид заводит администратора ERP и живёт в приложении: `pnpm erp db:seed`.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
