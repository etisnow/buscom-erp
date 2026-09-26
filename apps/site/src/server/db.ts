import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@buscom/db/client";
import { siteEnv } from "@/env";

// Один клиент на процесс: в dev hot reload иначе плодит пулы соединений.
// Пул маленький: сайт читает каталог из кеша, в базу ходит редко (src/server/catalog.ts)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({ connectionString: siteEnv().DATABASE_URL, max: 5 });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
