-- Доставка больше не входит в сумму заказа (решение владельца, 2026-09-25): клиент платит
-- транспортной компании сам. Стоимость доставки остаётся в заказе, из итога её вычитаем.
-- Схема не меняется — только данные. Каждый пересчитанный заказ получает запись в журнале.

INSERT INTO "OrderEvent" ("id", "orderId", "userId", "type", "comment", "payload", "createdAt")
SELECT
  gen_random_uuid()::text,
  "id",
  NULL,
  'UPDATED',
  'Сумма пересчитана: доставка больше не входит в сумму заказа',
  jsonb_build_object(
    'totalBeforeKopecks', "totalKopecks",
    'totalAfterKopecks', "totalKopecks" - "deliveryPriceKopecks",
    'deliveryPriceKopecks', "deliveryPriceKopecks"
  ),
  CURRENT_TIMESTAMP
FROM "Order"
WHERE "deliveryPriceKopecks" > 0;

UPDATE "Order"
SET "totalKopecks" = "totalKopecks" - "deliveryPriceKopecks"
WHERE "deliveryPriceKopecks" > 0;
