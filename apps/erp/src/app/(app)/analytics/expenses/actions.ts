"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expenseInputSchema, type ExpenseInput } from "@buscom/domain/analytics/expenses";
import { ANALYTICS_ROLES } from "@buscom/domain/user/role";
import { createExpense, deleteExpense, updateExpense } from "@/server/analytics/expenses";
import { requireUser } from "@/server/session";

export type ExpenseResult = { ok: true; message: string } | { ok: false; error: string };

async function run(action: () => Promise<unknown>, message: string): Promise<ExpenseResult> {
  try {
    await action();
    revalidatePath("/analytics", "layout");
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить" };
  }
}

/** Новый расход (`id` не задан) или правка существующего. */
export async function saveExpenseAction(id: string | null, input: ExpenseInput): Promise<ExpenseResult> {
  const user = await requireUser(ANALYTICS_ROLES);
  const parsed = expenseInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? z.prettifyError(parsed.error) };

  return id
    ? run(() => updateExpense(id, parsed.data, user), "Расход сохранён")
    : run(() => createExpense(parsed.data, user), "Расход добавлен");
}

export async function deleteExpenseAction(id: string): Promise<ExpenseResult> {
  const user = await requireUser(ANALYTICS_ROLES);
  return run(() => deleteExpense(id, user), "Расход удалён");
}
