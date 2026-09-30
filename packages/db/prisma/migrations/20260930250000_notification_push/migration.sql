-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "pushedAt" TIMESTAMP(3);

-- Уведомления, созданные до пушей, пушем не отправляем
UPDATE "Notification" SET "pushedAt" = "createdAt";
