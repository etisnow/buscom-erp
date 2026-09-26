-- Закупка вариантов опций товара у поставщика — «Подтянуть цены опций»
-- (src/domain/product/option-matching.ts)

-- CreateTable
CREATE TABLE "ProductSupplierOptionPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "optionValueId" TEXT NOT NULL,
    "purchasePriceKopecks" INTEGER NOT NULL,
    "variant" JSONB,

    CONSTRAINT "ProductSupplierOptionPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSupplierOptionPrice_optionValueId_idx" ON "ProductSupplierOptionPrice"("optionValueId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSupplierOptionPrice_productId_supplierId_optionValue_key" ON "ProductSupplierOptionPrice"("productId", "supplierId", "optionValueId");

-- AddForeignKey
ALTER TABLE "ProductSupplierOptionPrice" ADD CONSTRAINT "ProductSupplierOptionPrice_productId_supplierId_fkey" FOREIGN KEY ("productId", "supplierId") REFERENCES "ProductSupplier"("productId", "supplierId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplierOptionPrice" ADD CONSTRAINT "ProductSupplierOptionPrice_optionValueId_fkey" FOREIGN KEY ("optionValueId") REFERENCES "ProductOptionValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

