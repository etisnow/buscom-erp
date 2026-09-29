"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EXPENSE_BASE_LABELS,
  EXPENSE_BASES,
  EXPENSE_RECURRENCE_LABELS,
  EXPENSE_RECURRENCES,
  describeExpense,
  type ExpenseInput,
} from "@buscom/domain/analytics/expenses";
import { formatMoscowDate, toDateInput } from "@buscom/domain/datetime";
import { rublesToKopecks } from "@buscom/domain/money";
import { parsePercentInput, percentInputValue } from "@buscom/domain/supplier/price-economics";
import type { ExpenseBase, ExpenseRecurrence } from "@buscom/db/enums";
import type { ExpenseRow } from "@/server/analytics/expenses";
import { deleteExpenseAction, saveExpenseAction, type ExpenseResult } from "@/app/(app)/analytics/expenses/actions";
import { cn } from "@/lib/utils";

type Kind = "AMOUNT" | "PERCENT";

type Draft = {
  id: string | null;
  name: string;
  comment: string;
  kind: Kind;
  recurrence: ExpenseRecurrence;
  amount: string;
  percent: string;
  base: ExpenseBase;
  startsOn: string;
  endsOn: string;
};

function emptyDraft(today: string): Draft {
  return {
    id: null,
    name: "",
    comment: "",
    kind: "AMOUNT",
    recurrence: "MONTHLY",
    amount: "",
    percent: "",
    base: "REVENUE",
    startsOn: today,
    endsOn: "",
  };
}

function draftFrom(row: ExpenseRow): Draft {
  return {
    id: row.id,
    name: row.name,
    comment: row.comment ?? "",
    kind: row.percentHundredths !== null ? "PERCENT" : "AMOUNT",
    recurrence: row.recurrence ?? "MONTHLY",
    amount: row.amountKopecks !== null ? (row.amountKopecks / 100).toFixed(2).replace(/\.00$/, "") : "",
    percent: row.percentHundredths !== null ? percentInputValue(row.percentHundredths) : "",
    base: row.base ?? "REVENUE",
    startsOn: toDateInput(row.startsOn),
    endsOn: row.endsOn ? toDateInput(row.endsOn) : "",
  };
}

/** Черновик формы → ввод для сервера; ошибка разбора суммы или процента — текстом. */
function toInput(draft: Draft): ExpenseInput | string {
  const common = { name: draft.name, comment: draft.comment, startsOn: draft.startsOn, endsOn: draft.endsOn };
  if (draft.kind === "PERCENT") {
    const percentHundredths = parsePercentInput(draft.percent);
    if (percentHundredths === null) return "Процент — число, например 6 или 2,5";
    return { ...common, kind: "PERCENT", base: draft.base, percentHundredths };
  }
  try {
    return { ...common, kind: "AMOUNT", recurrence: draft.recurrence, amountKopecks: rublesToKopecks(draft.amount) };
  } catch {
    return "Сумма — число рублей, например 15000 или 1 250,50";
  }
}

function activeLabel(row: ExpenseRow): string {
  if (row.recurrence === "ONCE") return formatMoscowDate(row.startsOn);
  return row.endsOn
    ? `${formatMoscowDate(row.startsOn)} — ${formatMoscowDate(row.endsOn)}`
    : `с ${formatMoscowDate(row.startsOn)}, бессрочно`;
}

/**
 * Расходы: форма сверху (новый или правка выбранного) и список всех расходов.
 * Удаление подтверждается в строке, как в справочниках.
 */
export function ExpensesEditor({ expenses, today }: { expenses: ExpenseRow[]; today: string }) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(today));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const once = draft.kind === "AMOUNT" && draft.recurrence === "ONCE";

  function update(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function handle(action: Promise<ExpenseResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) {
        toast.success(result.message);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  function submit() {
    const input = toInput(draft);
    if (typeof input === "string") {
      toast.error(input);
      return;
    }
    handle(saveExpenseAction(draft.id, input), () => setDraft(emptyDraft(today)));
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">{draft.id ? "Правка расхода" : "Новый расход"}</h2>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-60 flex-1 flex-col gap-1.5 sm:max-w-xl">
              <Label htmlFor="expense-name" className="text-xs">
                Название
              </Label>
              <Input
                id="expense-name"
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="Аренда склада, реклама, налог…"
                className="h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">Размер</span>
              <div className="bg-muted flex gap-1 rounded-lg p-1" role="radiogroup" aria-label="Размер расхода">
                {(
                  [
                    ["AMOUNT", "Сумма"],
                    ["PERCENT", "Процент"],
                  ] as const
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={draft.kind === kind}
                    onClick={() => update({ kind })}
                    className={cn(
                      "rounded-md px-3 py-0.5 text-sm",
                      draft.kind === kind
                        ? "bg-background font-medium shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            {draft.kind === "AMOUNT" ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="expense-recurrence" className="text-xs">
                    Как часто
                  </Label>
                  <Select
                    value={draft.recurrence}
                    onValueChange={(value) => update({ recurrence: value as ExpenseRecurrence })}
                  >
                    <SelectTrigger id="expense-recurrence" className="w-40" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_RECURRENCES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {EXPENSE_RECURRENCE_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="expense-amount" className="text-xs">
                    Сумма, ₽
                  </Label>
                  <Input
                    id="expense-amount"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(event) => update({ amount: event.target.value })}
                    className="h-8 w-36"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="expense-percent" className="text-xs">
                    Процент
                  </Label>
                  <Input
                    id="expense-percent"
                    inputMode="decimal"
                    value={draft.percent}
                    onChange={(event) => update({ percent: event.target.value })}
                    className="h-8 w-24"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="expense-base" className="text-xs">
                    от
                  </Label>
                  <Select value={draft.base} onValueChange={(value) => update({ base: value as ExpenseBase })}>
                    <SelectTrigger id="expense-base" className="w-44" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_BASES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {EXPENSE_BASE_LABELS[item]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-starts" className="text-xs">
                {once ? "Дата" : "Действует с"}
              </Label>
              <Input
                id="expense-starts"
                type="date"
                value={draft.startsOn}
                onChange={(event) => update({ startsOn: event.target.value })}
                className="h-8 w-40"
              />
            </div>
            {once ? null : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expense-ends" className="text-xs">
                  по (пусто — бессрочно)
                </Label>
                <Input
                  id="expense-ends"
                  type="date"
                  value={draft.endsOn}
                  onChange={(event) => update({ endsOn: event.target.value })}
                  className="h-8 w-40"
                />
              </div>
            )}
          </div>

          <Textarea
            value={draft.comment}
            onChange={(event) => update({ comment: event.target.value })}
            placeholder="Комментарий (необязательно)"
            rows={2}
            className="max-w-2xl"
          />

          <p className="text-muted-foreground text-xs">
            {draft.kind === "PERCENT"
              ? "Процент считается от величины аналитики за те дни периода, когда расход действует. Убыточная маржа даёт 0."
              : once
                ? "Разовый расход целиком попадает в период, куда входит его дата."
                : "Регулярная сумма раскладывается равномерно: квартальная — по трети в месяц, годовая — по 1/12, внутри месяца — по дням."}{" "}
            Сумма поменялась (подорожала аренда) — закончите старый расход датой «по» и заведите новый: так прошлые
            периоды останутся как были.
          </p>

          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending || !draft.name.trim()}>
              {draft.id ? null : <Plus />}
              {draft.id ? "Сохранить" : "Добавить"}
            </Button>
            {draft.id ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(emptyDraft(today))}>
                Отменить
              </Button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">Все расходы</h2>
        {expenses.length === 0 ? (
          <p className="text-muted-foreground text-sm">Расходов пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr>
                  <th className="py-1 text-left font-normal">Расход</th>
                  <th className="py-1 pl-3 text-left font-normal">Размер</th>
                  <th className="py-1 pl-3 text-left font-normal">Когда</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {expenses.map((row) => {
                  const ended = row.endsOn !== null && toDateInput(row.endsOn) < today;
                  return (
                    <tr key={row.id} className={cn("border-t", draft.id === row.id && "bg-muted/50")}>
                      <td className="py-1.5 pr-2">
                        <div className={ended ? "text-muted-foreground" : ""}>{row.name}</div>
                        {row.comment ? (
                          <div className="text-muted-foreground line-clamp-2 text-xs">{row.comment}</div>
                        ) : null}
                      </td>
                      <td className="py-1.5 pl-3 whitespace-nowrap tabular-nums">{describeExpense(row)}</td>
                      <td className="text-muted-foreground py-1.5 pl-3 whitespace-nowrap">
                        {activeLabel(row)}
                        {ended ? " · закончился" : ""}
                      </td>
                      <td className="py-1.5 pl-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label="Изменить"
                            disabled={pending}
                            onClick={() => {
                              setDraft(draftFrom(row));
                              window.scrollTo({ top: 0, behavior: "smooth" });
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {confirmDelete === row.id ? (
                            <span className="flex items-center gap-1">
                              <span className="text-muted-foreground text-xs">Удалить?</span>
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={pending}
                                onClick={() => {
                                  handle(deleteExpenseAction(row.id), () => {
                                    if (draft.id === row.id) setDraft(emptyDraft(today));
                                  });
                                  setConfirmDelete(null);
                                }}
                              >
                                Да
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                                Нет
                              </Button>
                            </span>
                          ) : (
                            <Button
                              variant="destructive"
                              size="icon"
                              className="size-8"
                              aria-label="Удалить"
                              disabled={pending}
                              onClick={() => setConfirmDelete(row.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
