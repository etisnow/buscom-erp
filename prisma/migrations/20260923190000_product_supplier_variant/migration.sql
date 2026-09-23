-- Выбранные варианты товара на странице поставщика — для «Подтянуть цену»
-- по конкретному варианту (src/domain/product/vanproject.ts)

-- AlterTable
ALTER TABLE "ProductSupplier" ADD COLUMN     "variant" JSONB;
