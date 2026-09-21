-- AlterEnum
ALTER TYPE "DictionaryType" ADD VALUE 'ORDER_SOURCE';

-- AlterTable
ALTER TABLE "DictionaryItem" ADD COLUMN     "systemCode" "OrderSource";

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "sourceItemId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryItem_type_systemCode_key" ON "DictionaryItem"("type", "systemCode");

-- CreateIndex
CREATE INDEX "Order_sourceItemId_idx" ON "Order"("sourceItemId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "DictionaryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

