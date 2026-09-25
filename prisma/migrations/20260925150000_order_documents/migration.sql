-- Файлы самого заказа (OrderDocument): транспортная накладная в блоке «Доставка»
-- и дальше — другие виды по ключу kind. Не поставщика, поэтому не в OrderSupplierDocument.

-- AlterEnum
ALTER TYPE "OrderEventType" ADD VALUE 'ORDER_DOCUMENT_CHANGED';

-- CreateTable
CREATE TABLE "OrderDocument" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderDocument_orderId_kind_key" ON "OrderDocument"("orderId", "kind");

-- AddForeignKey
ALTER TABLE "OrderDocument" ADD CONSTRAINT "OrderDocument_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
