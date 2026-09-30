-- В описаниях товаров категории «Стекла» убираем цены вида « - 20 500 руб.» после размера:
-- цену показывают варианты выбора рядом с описанием, в тексте она устаревала.
UPDATE "Product"
SET "description" = regexp_replace("description", '[[:space:]]*[-–—][[:space:]]*[0-9][[:digit:][:space:]]*руб\.?', '', 'g')
WHERE "description" IS NOT NULL
  AND "categoryId" IN (SELECT "id" FROM "ProductCategory" WHERE "slug" = 'stekla');
