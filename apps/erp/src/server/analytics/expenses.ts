import "server-only";
import type { ExpenseData } from "@buscom/domain/analytics/expenses";
import { ANALYTICS_ROLES, hasRole } from "@buscom/domain/user/role";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/**
 * Расходы компании для экрана «Аналитика». Заводят и видят те же, кто видит
 * аналитику, — руководитель и администратор. Расход не относится к заказу, поэтому
 * журнала `OrderEvent` у него нет; удаляется физически, как опечатка.
 */

const EXPENSE_SELECT = {
  id: true,
  name: true,
  comment: true,
  recurrence: true,
  amountKopecks: true,
  percentHundredths: true,
  base: true,
  startsOn: true,
  endsOn: true,
  updatedAt: true,
  createdBy: { select: { name: true } },
} as const;

export type ExpenseRow = {
  id: string;
  name: string;
  comment: string | null;
  recurrence: ExpenseData["recurrence"];
  amountKopecks: number | null;
  percentHundredths: number | null;
  base: ExpenseData["base"];
  startsOn: Date;
  endsOn: Date | null;
  updatedAt: Date;
  authorName: string | null;
};

function assertCanManage(user: SessionUser) {
  if (!hasRole(user.role, ANALYTICS_ROLES)) {
    throw new ForbiddenError("Расходы видят и правят руководитель и администратор");
  }
}

/** Все расходы: сначала действующие и будущие, затем закончившиеся; внутри — по дате начала. */
export async function listExpenses(user: SessionUser): Promise<ExpenseRow[]> {
  assertCanManage(user);
  const rows = await db.expense.findMany({ select: EXPENSE_SELECT, orderBy: [{ startsOn: "desc" }, { name: "asc" }] });
  return rows.map(({ createdBy, ...row }) => ({ ...row, authorName: createdBy?.name ?? null }));
}

export async function createExpense(data: ExpenseData, user: SessionUser): Promise<void> {
  assertCanManage(user);
  await db.expense.create({ data: { ...data, createdById: user.id } });
}

export async function updateExpense(id: string, data: ExpenseData, user: SessionUser): Promise<void> {
  assertCanManage(user);
  const { count } = await db.expense.updateMany({ where: { id }, data });
  if (count === 0) throw new Error("Расход не найден — возможно, его уже удалили");
}

export async function deleteExpense(id: string, user: SessionUser): Promise<void> {
  assertCanManage(user);
  await db.expense.deleteMany({ where: { id } });
}
