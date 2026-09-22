-- Раздел «Действия и артефакты» у поставщика (docs/DECISIONS.md). enabledActions —
-- какие функции у него включены; по умолчанию «Заказ поставщику», чтобы уже
-- заведённые поставщики не потеряли кнопку, которая у них и так была всегда.
-- OrderSupplierDocument — прикреплённые файлы (счёт от поставщика клиенту и т.п.),
-- отдельно от OrderSupplierTrack: тот трек удаляется вместе с позициями поставщика
-- в заказе, а файл должен пережить это.

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'SUPPLIER_DOCUMENT_CHANGED';

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "enabledActions" TEXT[] DEFAULT ARRAY['SUPPLIER_REQUEST']::TEXT[];

-- CreateTable
CREATE TABLE "OrderSupplierDocument" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSupplierDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderSupplierDocument_orderId_idx" ON "OrderSupplierDocument"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSupplierDocument_orderId_supplierId_kind_key" ON "OrderSupplierDocument"("orderId", "supplierId", "kind");

-- AddForeignKey
ALTER TABLE "OrderSupplierDocument" ADD CONSTRAINT "OrderSupplierDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSupplierDocument" ADD CONSTRAINT "OrderSupplierDocument_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

