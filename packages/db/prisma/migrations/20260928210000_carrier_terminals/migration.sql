-- CreateEnum
CREATE TYPE "TerminalCarrier" AS ENUM ('DELLIN');

-- CreateTable
CREATE TABLE "CarrierTerminal" (
    "id" TEXT NOT NULL,
    "carrier" "TerminalCarrier" NOT NULL,
    "externalId" TEXT NOT NULL,
    "cityName" TEXT NOT NULL,
    "cityCode" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "fullAddress" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "schedule" TEXT,
    "phone" TEXT,
    "receivesCargo" BOOLEAN NOT NULL,
    "givesOutCargo" BOOLEAN NOT NULL,
    "maxWeightKg" INTEGER,
    "maxLengthCm" INTEGER,
    "maxWidthCm" INTEGER,
    "maxHeightCm" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CarrierTerminal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CarrierTerminal_carrier_isActive_cityName_idx" ON "CarrierTerminal"("carrier", "isActive", "cityName");

-- CreateIndex
CREATE UNIQUE INDEX "CarrierTerminal_carrier_externalId_key" ON "CarrierTerminal"("carrier", "externalId");
