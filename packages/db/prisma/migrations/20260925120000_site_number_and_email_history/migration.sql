-- Номер заказа на сайте отдельным полем и отметка импортированной истории писем.
-- Только новые колонки и заполнение siteNumber из уже лежащих данных.

-- AlterTable
ALTER TABLE "Email" ADD COLUMN     "importedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "siteNumber" TEXT;

-- CreateIndex
CREATE INDEX "Order_siteNumber_idx" ON "Order"("siteNumber");

-- Заказы с сайта: номер на сайте — их externalId
UPDATE "Order" SET "siteNumber" = "externalId" WHERE "source" = 'SITE' AND "externalId" IS NOT NULL;

-- Архив прежней ERP: «Номер там: N.» в комментарии события CREATED (src/domain/order/legacy-import.ts).
-- externalId у них — ID прежней ERP, а не номер сайта
UPDATE "Order" AS o
SET "siteNumber" = sub.n
FROM (
  SELECT DISTINCT ON (e."orderId") e."orderId", substring(e."comment" from 'Номер там: ([0-9]+)\.') AS n
  FROM "OrderEvent" AS e
  JOIN "Order" AS lo ON lo."id" = e."orderId"
  WHERE lo."source" = 'LEGACY' AND e."type" = 'CREATED' AND e."comment" ~ 'Номер там: [0-9]+\.'
  ORDER BY e."orderId", e."createdAt"
) AS sub
WHERE o."id" = sub."orderId";
