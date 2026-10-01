-- CreateEnum
CREATE TYPE "ProductLogAction" AS ENUM ('CREATED', 'UPDATED', 'HIDDEN', 'SHOWN', 'DELETED');

-- CreateTable
CREATE TABLE "ProductLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" "ProductLogAction" NOT NULL,
    "changes" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductLog_createdAt_idx" ON "ProductLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProductLog_productId_createdAt_idx" ON "ProductLog"("productId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductLog" ADD CONSTRAINT "ProductLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
