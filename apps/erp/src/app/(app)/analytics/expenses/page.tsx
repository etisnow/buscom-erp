import type { Metadata } from "next";
import { AnalyticsTabs } from "@/components/analytics/analytics-tabs";
import { ExpensesEditor } from "@/components/analytics/expenses-editor";
import { toDateInput } from "@buscom/domain/datetime";
import { ANALYTICS_ROLES } from "@buscom/domain/user/role";
import { listExpenses } from "@/server/analytics/expenses";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Расходы — BusCom ERP",
};

export default async function ExpensesPage() {
  const user = await requirePageUser(ANALYTICS_ROLES);
  const expenses = await listExpenses(user);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-semibold">Аналитика</h1>
      <AnalyticsTabs current="expenses" />
      <p className="text-muted-foreground max-w-3xl text-sm">
        Расходы компании вне заказов: аренда, зарплаты, реклама, налоги. На вкладке «Сводка» они вычитаются из маржи —
        получается прибыль за период.
      </p>
      <ExpensesEditor expenses={expenses} today={toDateInput(new Date())} />
    </main>
  );
}
