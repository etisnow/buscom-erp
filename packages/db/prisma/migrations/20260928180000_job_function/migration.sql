-- Функция сотрудника (менеджер, логист) и закрепление этапов поставщиков за функцией
CREATE TYPE "JobFunction" AS ENUM ('MANAGER', 'LOGIST');

ALTER TABLE "user" ADD COLUMN "jobFunction" "JobFunction";

ALTER TABLE "SupplierStage" ADD COLUMN "jobFunction" "JobFunction";
