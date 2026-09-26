"use client";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatRub } from "@buscom/domain/money";
import type { SupplierCombo } from "@buscom/domain/product/option-matching";
import type { VariantSelection } from "@buscom/domain/product/vanproject";
import type { OptionGroupForm } from "@/components/products/product-options-editor";
import { cn } from "@/lib/utils";

/**
 * Закупка варианта опции у поставщика в форме товара. `candidates` — варианты
 * поставщика, из которых надо выбрать (сопоставление неоднозначно); `status` —
 * чем кончилось последнее «Подтянуть цены опций».
 */
export type OptionPriceDraft = {
  price: string;
  variant: VariantSelection | null;
  candidates: SupplierCombo[] | null;
  status: "auto" | "choose" | "none" | null;
};

export const EMPTY_OPTION_PRICE: OptionPriceDraft = { price: "", variant: null, candidates: null, status: null };

const STATUS_TEXT: Record<Exclude<OptionPriceDraft["status"], null>, string> = {
  auto: "подобрано",
  choose: "выберите вариант",
  none: "не найдено",
};

/**
 * Таблица «Закупка по опциям» под поставщиком: по строке на вариант каждой
 * группы опций. Цену можно вписать руками или выбрать из кандидатов с сайта.
 * Ключ — `key` варианта в форме опций: у сохранённых это id, у новых — временный.
 */
export function SupplierOptionPrices({
  groups,
  prices,
  onChange,
  disabled,
}: {
  groups: OptionGroupForm[];
  prices: Record<string, OptionPriceDraft>;
  onChange: (valueKey: string, next: OptionPriceDraft) => void;
  disabled: boolean;
}) {
  const values = groups.flatMap((group) => group.values.map((value) => ({ group, value })));
  if (values.length === 0) return null;
  const filled = values.filter(({ value }) => (prices[value.key]?.price ?? "").trim() !== "").length;
  const toChoose = values.filter(({ value }) => prices[value.key]?.status === "choose").length;

  return (
    <details className="rounded-md border px-2 py-1.5" open={filled > 0 || toChoose > 0}>
      <summary className="cursor-pointer text-xs select-none">
        Закупка по опциям — заполнено {filled} из {values.length}
        {toChoose > 0 ? <span className="text-amber-700 dark:text-amber-400"> · выбрать: {toChoose}</span> : null}
      </summary>
      <p className="text-muted-foreground mt-1 text-xs">
        Добавляется к закупке выше, когда в заказе выбран этот вариант, — как надбавка к цене продажи.
      </p>
      <div className="mt-2 flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col gap-1.5">
            {groups.length > 1 ? <span className="text-xs font-medium">{group.name}</span> : null}
            {group.values.map((value) => {
              const draft = prices[value.key] ?? EMPTY_OPTION_PRICE;
              const chosenIndex = draft.candidates?.findIndex(
                (candidate) => JSON.stringify(candidate.selection) === JSON.stringify(draft.variant),
              );
              return (
                <div key={value.key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs" title={value.name}>
                    {value.name || "без названия"}
                  </span>
                  {draft.candidates && draft.candidates.length > 0 ? (
                    <Select
                      value={chosenIndex !== undefined && chosenIndex >= 0 ? String(chosenIndex) : ""}
                      onValueChange={(index) => {
                        const candidate = draft.candidates?.[Number(index)];
                        if (!candidate) return;
                        onChange(value.key, {
                          ...draft,
                          price:
                            candidate.priceKopecks === null ? draft.price : (candidate.priceKopecks / 100).toFixed(2),
                          variant: candidate.selection,
                          status: null,
                        });
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger size="sm" className="w-full sm:w-72">
                        <SelectValue placeholder="Какой вариант у поставщика?" />
                      </SelectTrigger>
                      <SelectContent>
                        {draft.candidates.map((candidate, index) => (
                          <SelectItem key={candidate.label} value={String(index)}>
                            {candidate.label} ·{" "}
                            {candidate.priceKopecks === null ? "цены нет" : formatRub(candidate.priceKopecks)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : draft.status ? (
                    <span
                      className={cn(
                        "text-xs sm:w-72",
                        draft.status === "auto" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                      )}
                      title={draft.variant ? Object.values(draft.variant).join(" · ") : undefined}
                    >
                      {STATUS_TEXT[draft.status]}
                      {draft.status === "auto" && draft.variant ? `: ${Object.values(draft.variant).join(" · ")}` : ""}
                    </span>
                  ) : null}
                  <div className="flex items-center gap-1">
                    <Input
                      value={draft.price}
                      onChange={(event) => onChange(value.key, { ...draft, price: event.target.value })}
                      disabled={disabled}
                      inputMode="decimal"
                      placeholder="—"
                      aria-label={`Закупка: ${value.name}`}
                      className="h-8 w-28 text-right"
                    />
                    <span className="text-muted-foreground text-xs">₽</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </details>
  );
}
