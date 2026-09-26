-- Клиент готовится к импорту базы из прежней ERP (docs/STATUS.md, «Выгрузка клиентов»).
-- Миграция написана руками: генератор сделал бы DROP COLUMN "city" без переноса данных,
-- а уникальный индекс по телефону — без внятной ошибки на дублях.

-- 1. Адрес одной строкой. Город приклеиваем к адресу, чтобы не потерять его,
--    и только потом убираем колонку.
UPDATE "CustomerAddress"
SET "address" = btrim("city") || ', ' || "address"
WHERE "city" IS NOT NULL AND btrim("city") <> '';

ALTER TABLE "CustomerAddress" DROP COLUMN "city";

-- 2. Телефон уникален, но может быть пустым: в Postgres UNIQUE допускает сколько
--    угодно NULL, а непустые номера уже не задвоятся. Дубли до индекса не доживают,
--    поэтому сначала проверка с понятным сообщением — иначе выкат упадёт
--    на «could not create unique index» без подсказки, что делать.
DO $$
DECLARE duplicates text;
BEGIN
  SELECT string_agg("phone", ', ') INTO duplicates
  FROM (SELECT "phone" FROM "Customer" WHERE "phone" IS NOT NULL GROUP BY "phone" HAVING count(*) > 1) AS d;

  IF duplicates IS NOT NULL THEN
    RAISE EXCEPTION 'Телефон становится уникальным, но эти номера встречаются у нескольких клиентов: %. Слейте дубли на /customers («Объединить с дублем») и повторите выкат.', duplicates;
  END IF;
END $$;

DROP INDEX "Customer_phone_idx";
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- 3. Поля под импорт: контактное лицо у юрлица и паспорт физлица одной строкой.
ALTER TABLE "Customer" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "Customer" ADD COLUMN "passport" TEXT;
