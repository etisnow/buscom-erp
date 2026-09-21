/**
 * Копия общей dev-базы в локальную. Запуск: `pnpm db:pull` (туннель должен работать).
 *
 * Зачем: общая база на сервере (docs/DEV-DB.md) требует туннеля и сети. Перед
 * поездкой или при плохой связи локальная копия позволяет работать дальше —
 * переключил `DATABASE_URL` на закомментированную локальную строку и поехал.
 *
 * Направление только одно — с сервера на машину. Обратного `db:push` намеренно
 * нет: залить локальную базу поверх общей значит стереть работу второй машины.
 * Нужно перенести своё — переноси данными, а не целой базой.
 *
 * Откуда берётся — `DATABASE_URL`, куда кладётся — `LOCAL_DATABASE_URL` (обе в `.env`).
 * Локальная база перезаписывается целиком.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

const env = z
  .object({
    DATABASE_URL: z.string().url(),
    LOCAL_DATABASE_URL: z
      .string()
      .url({ error: "Нужна переменная LOCAL_DATABASE_URL — куда класть копию. Пример в .env.example" }),
  })
  .parse(process.env);

/**
 * Утилиты Postgres ставятся на Windows мимо PATH, поэтому ищем ещё и в обычном
 * месте установки. Версия берётся любая — формат дампа между 16 и 17 совместим.
 */
function resolveTool(name: string): string {
  const onPath = spawnSync(process.platform === "win32" ? `${name}.exe` : name, ["--version"], {
    stdio: "ignore",
  });
  if (onPath.status === 0) return name;

  for (const version of ["17", "16", "15"]) {
    const candidate = `C:/Program Files/PostgreSQL/${version}/bin/${name}.exe`;
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(`Не нашёл ${name}. Поставь клиентские утилиты PostgreSQL или добавь их в PATH.`);
}

/**
 * Параметры строки подключения, которые понимает Prisma и не понимает libpq:
 * `psql` с ними падает на «invalid URI query parameter». Убираем перед вызовом
 * утилит — в `.env` строка остаётся прежней, её читает приложение.
 */
const PRISMA_ONLY_PARAMS = [
  "schema",
  "connection_limit",
  "pool_timeout",
  "pgbouncer",
  "statement_cache_size",
  "socket_timeout",
];

function toLibpqUrl(value: string): string {
  const url = new URL(value);
  for (const param of PRISMA_ONLY_PARAMS) url.searchParams.delete(param);
  return url.toString();
}

/** Куда угодно, кроме своей машины, копию не кладём: перепутать базы стоит слишком дорого. */
function assertLocalTarget(target: string, source: string): void {
  const url = new URL(target);
  const local = ["localhost", "127.0.0.1", "::1"];

  if (!local.includes(url.hostname)) {
    throw new Error(`LOCAL_DATABASE_URL смотрит на «${url.hostname}» — копия кладётся только на свою машину.`);
  }
  if (url.port === new URL(source).port) {
    throw new Error(
      `LOCAL_DATABASE_URL использует порт ${url.port} — тот же, что у источника. Это порт туннеля, а не локальной базы.`,
    );
  }
  if (target === source) {
    throw new Error("LOCAL_DATABASE_URL совпадает с DATABASE_URL — копировать нечего.");
  }
}

function run(tool: string, args: string[], label: string): void {
  const result = spawnSync(tool, args, { stdio: ["ignore", "inherit", "inherit"] });
  if (result.status !== 0) throw new Error(`${label} завершилась с ошибкой`);
}

function main(): void {
  assertLocalTarget(env.LOCAL_DATABASE_URL, env.DATABASE_URL);

  const pgDump = resolveTool("pg_dump");
  const psql = resolveTool("psql");

  const sourceUrl = toLibpqUrl(env.DATABASE_URL);
  const targetUrl = toLibpqUrl(env.LOCAL_DATABASE_URL);
  const source = new URL(sourceUrl);
  const target = new URL(targetUrl);
  console.log(`Копирую ${source.pathname.slice(1)} (${source.host}) → ${target.pathname.slice(1)} (${target.host})`);

  // Туннель забывают запустить чаще всего — скажем об этом понятно, а не ошибкой pg_dump.
  const reachable = spawnSync(psql, ["-Atc", "select 1", sourceUrl], { stdio: "ignore" });
  if (reachable.status !== 0) {
    throw new Error(
      "Источник недоступен. Если это общая база — запусти в соседнем окне «pnpm db:tunnel».\n" +
        "Если туннель вроде бы запущен, проверь зависший процесс ssh: он держит порт, но связь уже мертва.",
    );
  }

  const dir = mkdtempSync(join(tmpdir(), "buscom-db-pull-"));
  const dump = join(dir, "dump.sql");
  try {
    // --clean --if-exists: локальная база перезаписывается целиком, без ручной чистки.
    // --no-owner --no-acl: роли на сервере и на машине разные, права не переносим.
    run(pgDump, ["--no-owner", "--no-acl", "--clean", "--if-exists", "-f", dump, sourceUrl], "Выгрузка");
    console.log("Выгрузка снята, заливаю в локальную базу");
    run(psql, ["-q", "-v", "ON_ERROR_STOP=1", "-f", dump, targetUrl], "Заливка");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  // Кириллицы в запросе быть не должно: на Windows аргументы уезжают в кодировку
  // консоли, и psql падает на «неверная последовательность байт для UTF8».
  // Забираем голые числа, подписи добавляем здесь.
  const counts = spawnSync(
    psql,
    [
      "-At",
      "-F",
      " ",
      "-c",
      'select (select count(*) from "Order"), (select count(*) from "Customer"), (select count(*) from "Product")',
      targetUrl,
    ],
    { encoding: "utf8" },
  );
  const [orders, customers, products] = counts.stdout.trim().split(" ");
  console.log(`Готово: заказов ${orders}, клиентов ${customers}, товаров ${products}`);
  console.log("Чтобы работать по локальной копии, переключи DATABASE_URL в .env на локальную строку.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
