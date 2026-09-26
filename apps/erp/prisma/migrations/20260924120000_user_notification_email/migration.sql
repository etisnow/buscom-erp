-- Почта для уведомлений в личных настройках сотрудника (docs/DECISIONS.md, «Личные настройки»)

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "notificationEmail" TEXT;
