"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRub, rublesToKopecks } from "@buscom/domain/money";
import {
  calculateUnitCost,
  orderCostsTotal,
  parsePercentInput,
  percentInputValue,
  PRICE_STEPS_MAX,
  type PriceFormula,
  type PriceStep,
} from "@buscom/domain/supplier/price-economics";
import { cn } from "@/lib/utils";
import { setSupplierPriceFormulaAction } from "@/app/(app)/suppliers/actions";

type StepKind = PriceStep["kind"];

/** Строка редактора: поля — строки из формы, в формулу переводятся при сохранении. */
type StepRow = {
  key: string;
  kind: StepKind;
  label: string;
  percent: string;
  base: "NOMINAL" | "RUNNING";
  amount: string;
  mode: "UP" | "NEAREST" | "DOWN";
};

type CostRow = { key: string; label: string; amount: string };

let nextKey = 0;
const newKey = () => `row-${++nextKey}`;

const KIND_LABELS: Record<StepKind, string> = {
  PERCENT: "Процент",
  PER_UNIT: "Сумма за штуку",
  ROUND: "Округление",
};

function kopecksInput(kopecks: number): string {
  return (kopecks / 100).toFixed(2).replace(/\.00$/, "").replace(".", ",");
}

function toRows(formula: PriceFormula): { steps: StepRow[]; costs: CostRow[] } {
  return {
    steps: formula.unitSteps.map((step) => ({
      key: newKey(),
      kind: step.kind,
      label: step.label,
      percent: step.kind === "PERCENT" ? percentInputValue(step.percentHundredths) : "",
      base: step.kind === "PERCENT" ? step.base : "RUNNING",
      amount:
        step.kind === "PER_UNIT"
          ? kopecksInput(step.amountKopecks)
          : step.kind === "ROUND"
            ? kopecksInput(step.stepKopecks)
            : "",
      mode: step.kind === "ROUND" ? step.mode : "UP",
    })),
    costs: formula.orderCosts.map((cost) => ({
      key: newKey(),
      label: cost.label,
      amount: kopecksInput(cost.amountKopecks),
    })),
  };
}

function parseAmount(value: string): number | null {
  try {
    const kopecks = rublesToKopecks(value);
    return kopecks >= 0 ? kopecks : null;
  } catch {
    return null;
  }
}

/** Строки → формула. Ошибки — по ключу строки, чтобы подсветить именно её. */
function toFormula(steps: StepRow[], costs: CostRow[]): { formula: PriceFormula; errors: Map<string, string> } {
  const errors = new Map<string, string>();
  const unitSteps: PriceStep[] = [];

  for (const row of steps) {
    const label = row.label.trim();
    if (row.kind === "PERCENT") {
      const hundredths = parsePercentInput(row.percent);
      if (hundredths === null) errors.set(row.key, "Процент — число, например 5 или 2,5");
      else if (hundredths < -10_000 || hundredths > 100_000) errors.set(row.key, "Процент — от −100 до 1000");
      else unitSteps.push({ kind: "PERCENT", label, percentHundredths: hundredths, base: row.base });
    } else if (row.kind === "PER_UNIT") {
      const amount = parseAmount(row.amount);
      if (amount === null) errors.set(row.key, "Сумма в рублях, например 150 или 99,90");
      else unitSteps.push({ kind: "PER_UNIT", label, amountKopecks: amount });
    } else {
      const amount = parseAmount(row.amount);
      if (amount === null || amount === 0) errors.set(row.key, "До какой суммы округлять, например 10");
      else unitSteps.push({ kind: "ROUND", label, stepKopecks: amount, mode: row.mode });
    }
  }

  const orderCosts: PriceFormula["orderCosts"] = [];
  for (const row of costs) {
    const amount = parseAmount(row.amount);
    if (amount === null) errors.set(row.key, "Сумма в рублях, например 500");
    else orderCosts.push({ label: row.label.trim(), amountKopecks: amount });
  }

  return { formula: { unitSteps, orderCosts }, errors };
}

/**
 * «Экономика цены»: во что нам обходится товар этого поставщика. Шаги
 * применяются к номиналу по порядку, расходы на заказ — отдельно, один раз на
 * заказ. Внизу — проверка на любой цене с расшифровкой по шагам.
 */
export function PriceEconomicsEditor({
  supplierId,
  initial,
  editable,
  sampleNominalKopecks,
}: {
  supplierId: string;
  initial: PriceFormula;
  editable: boolean;
  /** Цена для проверки по умолчанию — закупка первого товара поставщика */
  sampleNominalKopecks: number;
}) {
  const initialRows = useMemo(() => toRows(initial), [initial]);
  const [steps, setSteps] = useState<StepRow[]>(initialRows.steps);
  const [costs, setCosts] = useState<CostRow[]>(initialRows.costs);
  const [sample, setSample] = useState(kopecksInput(sampleNominalKopecks));
  const [pending, startTransition] = useTransition();

  const { formula, errors } = toFormula(steps, costs);
  const initialJson = JSON.stringify(toFormula(initialRows.steps, initialRows.costs).formula);
  const dirty = JSON.stringify(formula) !== initialJson || errors.size > 0;

  const sampleKopecks = parseAmount(sample);
  const preview = sampleKopecks === null ? null : calculateUnitCost(sampleKopecks, formula);
  const orderCost = orderCostsTotal(formula);

  function updateStep(key: string, patch: Partial<StepRow>) {
    setSteps((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function moveStep(index: number, delta: number) {
    setSteps((rows) => {
      const next = [...rows];
      const [row] = next.splice(index, 1);
      next.splice(index + delta, 0, row!);
      return next;
    });
  }

  function addStep(kind: StepKind) {
    setSteps((rows) => [
      ...rows,
      {
        key: newKey(),
        kind,
        label: "",
        percent: "",
        base: "RUNNING",
        amount: kind === "ROUND" ? "10" : "",
        mode: "UP",
      },
    ]);
  }

  function updateCost(key: string, patch: Partial<CostRow>) {
    setCosts((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function reset() {
    const rows = toRows(initial);
    setSteps(rows.steps);
    setCosts(rows.costs);
  }

  function save() {
    startTransition(async () => {
      const result = await setSupplierPriceFormulaAction(supplierId, formula);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  const disabled = !editable || pending;

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Экономика цены</h2>
        <p className="text-muted-foreground text-sm">
          Во что нам обходится товар этого поставщика. Номинал — его цена из карточки товара; к ней по порядку
          применяются шаги ниже. Правка действует на заказы, где поставщика выберут после сохранения, — в уже выбранных
          позициях стоимость запомнена.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Цена за штуку</h3>
        {steps.length === 0 ? (
          <p className="text-muted-foreground text-sm">Шагов нет — стоимость для нас равна номиналу.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((row, index) => (
              <li key={row.key} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground w-5 text-right text-sm">{index + 1}.</span>
                  <Select
                    value={row.kind}
                    onValueChange={(kind) => updateStep(row.key, { kind: kind as StepKind })}
                    disabled={disabled}
                  >
                    <SelectTrigger size="sm" className="w-40" aria-label={`Шаг ${index + 1}: вид`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(KIND_LABELS) as StepKind[]).map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {KIND_LABELS[kind]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {row.kind === "PERCENT" ? (
                    <>
                      <div className="flex items-center gap-1">
                        <Input
                          value={row.percent}
                          onChange={(event) => updateStep(row.key, { percent: event.target.value })}
                          disabled={disabled}
                          inputMode="decimal"
                          aria-label={`Шаг ${index + 1}: процент`}
                          className="h-8 w-20 text-right"
                        />
                        <span className="text-muted-foreground text-sm">%</span>
                      </div>
                      <Select
                        value={row.base}
                        onValueChange={(base) => updateStep(row.key, { base: base as StepRow["base"] })}
                        disabled={disabled}
                      >
                        <SelectTrigger size="sm" className="w-44" aria-label={`Шаг ${index + 1}: от чего`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RUNNING">от текущей суммы</SelectItem>
                          <SelectItem value="NOMINAL">от номинала</SelectItem>
                        </SelectContent>
                      </Select>
                    </>
                  ) : row.kind === "PER_UNIT" ? (
                    <div className="flex items-center gap-1">
                      <span className="text-muted-foreground text-sm">+</span>
                      <Input
                        value={row.amount}
                        onChange={(event) => updateStep(row.key, { amount: event.target.value })}
                        disabled={disabled}
                        inputMode="decimal"
                        aria-label={`Шаг ${index + 1}: сумма`}
                        className="h-8 w-24 text-right"
                      />
                      <span className="text-muted-foreground text-sm">₽ за штуку</span>
                    </div>
                  ) : (
                    <>
                      <Select
                        value={row.mode}
                        onValueChange={(mode) => updateStep(row.key, { mode: mode as StepRow["mode"] })}
                        disabled={disabled}
                      >
                        <SelectTrigger size="sm" className="w-36" aria-label={`Шаг ${index + 1}: как округлять`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="UP">вверх</SelectItem>
                          <SelectItem value="NEAREST">до ближайших</SelectItem>
                          <SelectItem value="DOWN">вниз</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-sm">до</span>
                        <Input
                          value={row.amount}
                          onChange={(event) => updateStep(row.key, { amount: event.target.value })}
                          disabled={disabled}
                          inputMode="decimal"
                          aria-label={`Шаг ${index + 1}: кратность`}
                          className="h-8 w-20 text-right"
                        />
                        <span className="text-muted-foreground text-sm">₽</span>
                      </div>
                    </>
                  )}

                  <Input
                    value={row.label}
                    onChange={(event) => updateStep(row.key, { label: event.target.value })}
                    disabled={disabled}
                    placeholder="Название, например «Обналичка»"
                    aria-label={`Шаг ${index + 1}: название`}
                    className="h-8 min-w-40 flex-1"
                  />

                  {editable ? (
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Выше"
                        disabled={pending || index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Ниже"
                        disabled={pending || index === steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        <ArrowDown className="size-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="size-8"
                        aria-label="Убрать шаг"
                        disabled={pending}
                        onClick={() => setSteps((rows) => rows.filter((item) => item.key !== row.key))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {errors.has(row.key) ? <p className="text-destructive ml-7 text-xs">{errors.get(row.key)}</p> : null}
              </li>
            ))}
          </ol>
        )}

        {editable && steps.length < PRICE_STEPS_MAX ? (
          <div className="flex flex-wrap gap-2">
            {(Object.keys(KIND_LABELS) as StepKind[]).map((kind) => (
              <Button key={kind} variant="outline" size="sm" disabled={pending} onClick={() => addStep(kind)}>
                <Plus />
                {KIND_LABELS[kind]}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div>
          <h3 className="text-sm font-medium">Расходы на заказ</h3>
          <p className="text-muted-foreground text-xs">
            Добавляются один раз к заказу у этого поставщика, сколько бы штук ни было, — например, отправка до нас.
          </p>
        </div>
        {costs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {costs.map((row) => (
              <li key={row.key} className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={row.label}
                    onChange={(event) => updateCost(row.key, { label: event.target.value })}
                    disabled={disabled}
                    placeholder="Название, например «Отправка»"
                    aria-label="Расход: название"
                    className="h-8 min-w-40 flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <Input
                      value={row.amount}
                      onChange={(event) => updateCost(row.key, { amount: event.target.value })}
                      disabled={disabled}
                      inputMode="decimal"
                      aria-label="Расход: сумма"
                      className="h-8 w-24 text-right"
                    />
                    <span className="text-muted-foreground text-sm">₽ на заказ</span>
                  </div>
                  {editable ? (
                    <Button
                      variant="destructive"
                      size="icon"
                      className="size-8"
                      aria-label="Убрать расход"
                      disabled={pending}
                      onClick={() => setCosts((rows) => rows.filter((item) => item.key !== row.key))}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
                {errors.has(row.key) ? <p className="text-destructive text-xs">{errors.get(row.key)}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {editable && costs.length < PRICE_STEPS_MAX ? (
          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            disabled={pending}
            onClick={() => setCosts((rows) => [...rows, { key: newKey(), label: "", amount: "" }])}
          >
            <Plus />
            Расход на заказ
          </Button>
        ) : null}
      </div>

      <div className="bg-muted/40 flex flex-col gap-2 rounded-md p-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">Проверить на цене</h3>
          <Input
            value={sample}
            onChange={(event) => setSample(event.target.value)}
            inputMode="decimal"
            aria-label="Номинал для проверки"
            className="h-8 w-28 text-right"
          />
          <span className="text-muted-foreground text-sm">₽</span>
        </div>
        {preview ? (
          <table className="w-full max-w-md text-sm">
            <tbody>
              <tr>
                <td className="py-0.5">Номинал</td>
                <td />
                <td className="py-0.5 text-right tabular-nums">{formatRub(preview.nominalKopecks)}</td>
              </tr>
              {preview.lines.map((line, index) => (
                <tr key={index} className="text-muted-foreground">
                  <td className="py-0.5">{line.label}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">
                    {line.deltaKopecks >= 0 ? "+" : "−"}
                    {formatRub(Math.abs(line.deltaKopecks))}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">{formatRub(line.totalKopecks)}</td>
                </tr>
              ))}
              <tr className="border-t font-medium">
                <td className="pt-1">Итого для нас за штуку</td>
                <td />
                <td className="pt-1 text-right tabular-nums">{formatRub(preview.costKopecks)}</td>
              </tr>
              {orderCost > 0 ? (
                <tr className="text-muted-foreground">
                  <td className="py-0.5">и на заказ</td>
                  <td />
                  <td className="py-0.5 text-right tabular-nums">+{formatRub(orderCost)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <p className="text-destructive text-xs">Цена для проверки — в рублях, например 300</p>
        )}
      </div>

      {editable && dirty ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={reset}>
            Отменить правки
          </Button>
          <Button size="sm" disabled={pending || errors.size > 0} onClick={save}>
            Сохранить
          </Button>
        </div>
      ) : null}
      <p className={cn("text-muted-foreground text-xs", !(editable && errors.size > 0) && "hidden")}>
        Исправьте подсвеченные строки — с ошибками формула не сохранится.
      </p>
    </section>
  );
}
