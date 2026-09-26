-- Статусная модель упрощена (docs/DECISIONS.md): глобальных статусов четыре —
-- «Создан», «В работе», «Выполнен», «Отменён». Промежуточные этапы работы с заказом
-- ведутся в цепочках поставщиков.
--
-- Написана руками: значение enum в Postgres не удаляется, тип пересоздаётся, а
-- заказы и журнал сначала переводятся на оставшиеся значения — иначе USING упал бы.
--   AWAITING_PAYMENT, PAID, SHIPPING → IN_PROGRESS (заказ ещё в работе);
--   SHIPPED → COMPLETED (отгружен — работа по заказу закончена).

-- 1. Журнал: прежний переход не теряем — дописываем его текстом в комментарий,
-- а сами поля статусов приводим к новой модели.
UPDATE "OrderEvent"
SET "comment" = concat_ws(
      ' ',
      'Статус до упрощения модели: ' ||
        coalesce(CASE "fromStatus"::text
          WHEN 'NEW' THEN 'Новый' WHEN 'IN_PROGRESS' THEN 'В работе' WHEN 'AWAITING_PAYMENT' THEN 'Ждёт оплаты'
          WHEN 'PAID' THEN 'Оплачен' WHEN 'SHIPPING' THEN 'Отправка' WHEN 'SHIPPED' THEN 'Отгружен'
          WHEN 'COMPLETED' THEN 'Выполнен' WHEN 'CANCELLED' THEN 'Отменён' END, '—') ||
        ' → ' ||
        coalesce(CASE "toStatus"::text
          WHEN 'NEW' THEN 'Новый' WHEN 'IN_PROGRESS' THEN 'В работе' WHEN 'AWAITING_PAYMENT' THEN 'Ждёт оплаты'
          WHEN 'PAID' THEN 'Оплачен' WHEN 'SHIPPING' THEN 'Отправка' WHEN 'SHIPPED' THEN 'Отгружен'
          WHEN 'COMPLETED' THEN 'Выполнен' WHEN 'CANCELLED' THEN 'Отменён' END, '—') || '.',
      "comment")
WHERE "fromStatus"::text IN ('AWAITING_PAYMENT', 'PAID', 'SHIPPING', 'SHIPPED')
   OR "toStatus"::text IN ('AWAITING_PAYMENT', 'PAID', 'SHIPPING', 'SHIPPED');

-- 2. Настройка SLA: нормативы убранных статусов удаляем, иначе она не прочитается.
UPDATE "Setting"
SET "value" = "value" - 'AWAITING_PAYMENT' - 'PAID' - 'SHIPPING' - 'SHIPPED'
WHERE "key" = 'slaMinutes' AND jsonb_typeof("value") = 'object';

-- 3. Тип пересоздаётся; значения переводятся прямо в USING.
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "OrderStatus_new" AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING (
  CASE "status"::text
    WHEN 'AWAITING_PAYMENT' THEN 'IN_PROGRESS' WHEN 'PAID' THEN 'IN_PROGRESS' WHEN 'SHIPPING' THEN 'IN_PROGRESS'
    WHEN 'SHIPPED' THEN 'COMPLETED'
    ELSE "status"::text
  END
)::"OrderStatus_new";

ALTER TABLE "OrderEvent" ALTER COLUMN "fromStatus" TYPE "OrderStatus_new" USING (
  CASE "fromStatus"::text
    WHEN 'AWAITING_PAYMENT' THEN 'IN_PROGRESS' WHEN 'PAID' THEN 'IN_PROGRESS' WHEN 'SHIPPING' THEN 'IN_PROGRESS'
    WHEN 'SHIPPED' THEN 'COMPLETED'
    ELSE "fromStatus"::text
  END
)::"OrderStatus_new";

ALTER TABLE "OrderEvent" ALTER COLUMN "toStatus" TYPE "OrderStatus_new" USING (
  CASE "toStatus"::text
    WHEN 'AWAITING_PAYMENT' THEN 'IN_PROGRESS' WHEN 'PAID' THEN 'IN_PROGRESS' WHEN 'SHIPPING' THEN 'IN_PROGRESS'
    WHEN 'SHIPPED' THEN 'COMPLETED'
    ELSE "toStatus"::text
  END
)::"OrderStatus_new";

DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'NEW';

-- 4. SLA-дедлайн заказов, переведённых в «Выполнен», больше не нужен.
UPDATE "Order" SET "slaDueAt" = NULL WHERE "status" IN ('COMPLETED', 'CANCELLED') AND "slaDueAt" IS NOT NULL;
