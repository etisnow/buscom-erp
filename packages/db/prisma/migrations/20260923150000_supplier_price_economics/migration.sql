-- «Экономика цены» у поставщика: формула от номинала к стоимости закупки для нас
-- (src/domain/supplier/price-economics.ts)

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "priceFormula" JSONB;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "purchaseCostKopecks" INTEGER;

-- AlterTable
ALTER TABLE "OrderSupplierTrack" ADD COLUMN     "orderCostKopecks" INTEGER NOT NULL DEFAULT 0;

-- Формул до этой миграции не было: для уже выбранных поставщиков стоимость
-- для нас равна номиналу. Без этого маржа старых заказов считалась бы неизвестной.
UPDATE "OrderItem" SET "purchaseCostKopecks" = "purchasePriceKopecks" WHERE "purchasePriceKopecks" IS NOT NULL;
