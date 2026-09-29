-- Расходы для экрана «Аналитика»: разовые и регулярные суммы, проценты от величин аналитики
CREATE TYPE "ExpenseRecurrence" AS ENUM ('ONCE', 'MONTHLY', 'QUARTERLY', 'YEARLY');

CREATE TYPE "ExpenseBase" AS ENUM ('REVENUE', 'MARGIN', 'PAYMENTS');

CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "comment" TEXT,
    "recurrence" "ExpenseRecurrence",
    "amountKopecks" INTEGER,
    "percentHundredths" INTEGER,
    "base" "ExpenseBase",
    "startsOn" TIMESTAMP(3) NOT NULL,
    "endsOn" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id"),
    -- Ровно один вид: сумма с периодичностью или процент от базы без неё
    CONSTRAINT "Expense_kind_check" CHECK (
        ("amountKopecks" IS NOT NULL AND "recurrence" IS NOT NULL AND "percentHundredths" IS NULL AND "base" IS NULL)
        OR ("amountKopecks" IS NULL AND "recurrence" IS NULL AND "percentHundredths" IS NOT NULL AND "base" IS NOT NULL)
    ),
    CONSTRAINT "Expense_period_check" CHECK ("endsOn" IS NULL OR "endsOn" >= "startsOn")
);

CREATE INDEX "Expense_startsOn_idx" ON "Expense"("startsOn");

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
