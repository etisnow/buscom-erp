-- Справочник категорий товаров с вложенностью (docs/DECISIONS.md, «Справочник категорий»).
-- Написана руками: сгенерированная удалила бы текстовую колонку `category` до переноса
-- её значений. Порядок: таблица → ссылка у товара → перенос → удаление колонки.

CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

ALTER TABLE "ProductCategory" ADD CONSTRAINT "ProductCategory_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT;

-- Каждое прежнее название — категория верхнего уровня. Вложенность («Климат» → «Люки»)
-- расставит повторный импорт с сайта: он переносит такую категорию под раздел, а не дублирует.
INSERT INTO "ProductCategory" ("id", "name", "updatedAt")
SELECT gen_random_uuid()::text, name, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT btrim("category") AS name FROM "Product" WHERE btrim(coalesce("category", '')) <> '') AS names;

UPDATE "Product" AS p
SET "categoryId" = c."id"
FROM "ProductCategory" AS c
WHERE c."parentId" IS NULL AND c."name" = btrim(p."category");

CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Product" DROP COLUMN "category";
