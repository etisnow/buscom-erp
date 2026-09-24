import { describe } from "vitest";
import { db } from "@/server/db";

/**
 * Помощник для тестов, которым нужна живая БД.
 *
 * Такие тесты идут только при `RUN_DB_TESTS=1` и только по базе, в имени которой есть
 * `test`. Обе проверки — защита от запуска по рабочей или боевой базе: `resetDb`
 * вычищает все таблицы, и ошибка здесь стоила бы данных.
 */
const DB_NAME_MUST_CONTAIN = "test";

function databaseName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "");
  } catch {
    return "";
  }
}

export function dbTestsEnabled(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const url = process.env.DATABASE_URL ?? "";
  return databaseName(url).includes(DB_NAME_MUST_CONTAIN);
}

/** `describeDb` вместо `describe`: без тестовой БД блок пропускается, а не падает. */
export const describeDb = dbTestsEnabled() ? describe : describe.skip;

const TABLES = [
  '"EmailAttachment"',
  '"Email"',
  '"Notification"',
  '"ProductImage"',
  '"OrderSupplierTrack"',
  '"ProductSupplier"',
  '"SupplierStage"',
  '"Supplier"',
  '"OrderEvent"',
  '"Payment"',
  '"OrderItem"',
  '"Order"',
  '"IntegrationInbox"',
  '"CustomerAddress"',
  '"Customer"',
  '"Product"',
  '"ProductCategory"',
  '"DictionaryItem"',
  '"Setting"',
  '"FailedLogin"',
  '"session"',
  '"account"',
  '"user"',
];

/** Чистый лист перед тестом. Нумерация заказов тоже сбрасывается — тесты проверяют номера. */
export async function resetDb(): Promise<void> {
  const name = databaseName(process.env.DATABASE_URL ?? "");
  if (!name.includes(DB_NAME_MUST_CONTAIN)) {
    throw new Error(`Отказ чистить базу «${name}»: в имени тестовой базы должно быть «${DB_NAME_MUST_CONTAIN}»`);
  }

  await db.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

export { db as testDb };
