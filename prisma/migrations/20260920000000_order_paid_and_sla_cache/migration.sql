-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidKopecks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "slaDueAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_slaDueAt_idx" ON "Order"("slaDueAt");
