-- AlterEnum
ALTER TYPE "TerminalCarrier" ADD VALUE 'PEC';

-- AlterTable
ALTER TABLE "CarrierTerminal" ADD COLUMN     "isPickupPoint" BOOLEAN NOT NULL DEFAULT false;
