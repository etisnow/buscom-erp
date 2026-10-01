-- Сиденья без совместимости — универсальные, ставятся на любую модель (владелец, 02.10.2026):
-- им отмечаются все активные модели справочника «Модели авто» в порядке справочника, как
-- сохраняет карточка товара (normalizeCompatibility). Только товарам, у которых совместимость
-- всё ещё пустая: разметку, сделанную руками до выката, не трогаем. Каждая правка — запись
-- в журнале товаров от имени системы, как при правке из карточки.
WITH "targets" AS (
    SELECT p."id", p."sku", p."name"
    FROM "Product" p
    WHERE p."sku" IN ('S11', 'PER03', 'S25', 'S08', 'SB01', 'SG01')
      AND cardinality(p."compatibility") = 0
), "all_models" AS (
    SELECT array_agg(d."name" ORDER BY d."sortOrder", d."name") AS "models"
    FROM "DictionaryItem" d
    WHERE d."type" = 'CAR_MODEL' AND d."isActive"
), "logged" AS (
    INSERT INTO "ProductLog" ("id", "productId", "sku", "name", "action", "changes", "userId")
    SELECT 'plog_20261002_all_models_' || t."sku", t."id", t."sku", t."name", 'UPDATED',
           jsonb_build_array(jsonb_build_object('label', 'Совместимость', 'from', NULL, 'to', array_to_string(m."models", ', '))),
           NULL
    FROM "targets" t CROSS JOIN "all_models" m
    WHERE m."models" IS NOT NULL
    ON CONFLICT ("id") DO NOTHING
)
UPDATE "Product" p
SET "compatibility" = m."models", "updatedAt" = CURRENT_TIMESTAMP
FROM "targets" t CROSS JOIN "all_models" m
WHERE p."id" = t."id" AND m."models" IS NOT NULL;

-- Запись журнала «Новости платформы»
INSERT INTO "PlatformNews" ("id", "title", "body", "publishedAt", "updatedAt") VALUES
    ('news_20261002_seats_all_models',
     'Универсальным сиденьям отмечены все модели',
     'У шести сидений, которые ставятся в любой микроавтобус, — Кресло Люкс (аналог Пульман), Пассажирское сиденье люкс категории M1, Автолайн-Люкс, Антивандальное, Бортовое и сиденье Гида — в совместимости теперь отмечены все модели из справочника. На сайте они появились в подборе по модели и на страницах «Сиденья для …» каждой машины.

Изменения видны в журнале товаров («Товары» → «Посмотреть логи»). Если какое-то из этих сидений подходит не ко всем машинам, снимите лишние модели в карточке товара.',
     '2026-10-01 21:20:00', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
