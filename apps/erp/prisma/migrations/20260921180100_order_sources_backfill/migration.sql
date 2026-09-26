-- Справочник источников заказов из прежнего фиксированного списка и привязка к нему
-- существующих заказов. Отдельной миграцией: новое значение enum `ORDER_SOURCE`
-- нельзя использовать в той же транзакции, где его добавили.
--
-- «Сайт» и «Прежняя ERP» — системные (systemCode): их ставят интеграция и импорт.
-- Остальные — обычные пункты, администратор может их переименовать и выключить.
-- ON CONFLICT: если пункт с таким названием уже завели руками, берём его, а не дублируем.

INSERT INTO "DictionaryItem" ("id", "type", "name", "sortOrder", "isActive", "systemCode", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'ORDER_SOURCE', 'Сайт',        10, true, 'SITE',   CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ORDER_SOURCE', 'Телефон',     20, true, NULL,     CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ORDER_SOURCE', 'Почта',       30, true, NULL,     CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ORDER_SOURCE', 'Мессенджер',  40, true, NULL,     CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ORDER_SOURCE', 'Другое',      50, true, NULL,     CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'ORDER_SOURCE', 'Прежняя ERP', 60, true, 'LEGACY', CURRENT_TIMESTAMP)
ON CONFLICT ("type", "name") DO NOTHING;

UPDATE "Order" AS o
SET "sourceItemId" = d."id"
FROM "DictionaryItem" AS d
WHERE d."type" = 'ORDER_SOURCE'
  AND o."sourceItemId" IS NULL
  AND d."name" = CASE o."source"
    WHEN 'SITE' THEN 'Сайт'
    WHEN 'PHONE' THEN 'Телефон'
    WHEN 'EMAIL' THEN 'Почта'
    WHEN 'MESSENGER' THEN 'Мессенджер'
    WHEN 'OTHER' THEN 'Другое'
    WHEN 'LEGACY' THEN 'Прежняя ERP'
  END;
