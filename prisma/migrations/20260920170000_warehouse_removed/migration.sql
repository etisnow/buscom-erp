-- Склада в компании нет (см. docs/DECISIONS.md): уходит учёт количества у товара,
-- роль WAREHOUSE, а статус ASSEMBLY («Сборка») становится SHIPPING («Отправка»).
--
-- Миграция написана руками, а не сгенерирована: Prisma выразила бы и переименование
-- значения enum, и удаление роли через DROP/ADD — с потерей заказов в этом статусе
-- и падением на сотрудниках со складской ролью.

-- 1. Статус: именно переименование значения. Заказы, которые сейчас в нём стоят,
-- остаются на месте и просто называются иначе.
ALTER TYPE "OrderStatus" RENAME VALUE 'ASSEMBLY' TO 'SHIPPING';

-- 2. Роль. Значение enum в Postgres удалить нельзя, поэтому тип пересоздаётся.
-- Сотрудников со складской ролью переводим в менеджеров до приведения типа —
-- иначе USING упадёт на непреобразуемом значении.
UPDATE "user" SET "role" = 'MANAGER' WHERE "role" = 'WAREHOUSE';

ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT;
CREATE TYPE "UserRole_new" AS ENUM ('MANAGER', 'HEAD', 'ADMIN');
ALTER TABLE "user" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'MANAGER';

-- 3. Каталог без количеств.
ALTER TABLE "Product"
  DROP COLUMN "stock",
  DROP COLUMN "reserved",
  DROP COLUMN "madeToOrder",
  DROP COLUMN "leadTimeDays";
