-- «Комиссия с прибыли» у поставщика и её снимок у поставщика в заказе
-- (src/domain/order/margin.ts). 0 — поставщик комиссию не удерживает.

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "profitCommissionHundredths" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderSupplierTrack" ADD COLUMN     "profitCommissionHundredths" INTEGER NOT NULL DEFAULT 0;
