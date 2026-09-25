"use client";

import { X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import { SAVED_FILTERS_COOKIE, SAVED_FILTERS_MAX_AGE } from "@/app/(app)/orders/saved-filters";
import type { OrderStatus } from "@/generated/prisma/enums";

const STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[];

const PAYMENTS = [
  { value: "unpaid", label: "Не оплачен" },
  { value: "partial", label: "Частично" },
  { value: "paid", label: "Оплачен" },
];

const ANY = "__any__";

/**
 * Память фильтров. Cookie, а не `localStorage`: подставляет запомненный набор
 * сервер, до отрисовки страницы (`src/app/(app)/orders/saved-filters.ts`).
 * Клиентское восстановление давало мигание — список успевал показаться без
 * фильтров. Браузер здесь только пишет и чистит.
 */
function writeSaved(value: string | null): void {
  const base = `${SAVED_FILTERS_COOKIE}=`;
  document.cookie = value
    ? `${base}${encodeURIComponent(value)}; path=/; max-age=${SAVED_FILTERS_MAX_AGE}; samesite=lax`
    : `${base}; path=/; max-age=0; samesite=lax`;
}

export function OrderFilters({
  managers,
  sources,
}: {
  managers: { id: string; name: string }[];
  /** Все источники справочника, включая выключенные: по ним тоже ищут старые заказы */
  sources: { id: string; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  /** Сохранить набор фильтров, кроме номера страницы: он к фильтрам не относится. */
  function remember(params: URLSearchParams): void {
    const next = new URLSearchParams(params);
    next.delete("page");
    writeSaved(next.toString() || null);
  }

  /** Любое изменение фильтра переписывает URL — состояние живёт только там. */
  function apply(changes: Record<string, string | string[] | null>) {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      next.delete(key);
      if (Array.isArray(value)) {
        for (const item of value) next.append(key, item);
      } else if (value !== null && value !== "" && value !== ANY) {
        next.set(key, value);
      }
    }
    next.delete("page");

    // Запоминаем здесь, а не в эффекте: нажатие — заведомо клиентский контекст,
    // и набор фильтров уже собран целиком.
    remember(next);
    router.push(`/orders?${next.toString()}`);
  }

  const selectedStatuses = searchParams.getAll("status");
  const hasFilters = ["q", "status", "manager", "source", "from", "to", "payment"].some((key) => searchParams.has(key));

  function toggleStatus(status: OrderStatus) {
    const next = selectedStatuses.includes(status)
      ? selectedStatuses.filter((item) => item !== status)
      : [...selectedStatuses, status];
    apply({ status: next });
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((status) => {
          const isOn = selectedStatuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              onClick={() => toggleStatus(status)}
              aria-pressed={isOn}
              className={
                isOn
                  ? "bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs max-md:px-4 max-md:py-2.5 max-md:text-sm"
                  : "hover:bg-accent rounded-full border px-3 py-1 text-xs max-md:px-4 max-md:py-2.5 max-md:text-sm"
              }
            >
              {ORDER_STATUS_LABELS[status]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="filter-manager">
            Менеджер
          </Label>
          <Select value={searchParams.get("manager") ?? ANY} onValueChange={(value) => apply({ manager: value })}>
            <SelectTrigger id="filter-manager" className="w-48">
              <SelectValue placeholder="Любой" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Любой</SelectItem>
              {managers.map((manager) => (
                <SelectItem key={manager.id} value={manager.id}>
                  {manager.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="filter-source">
            Источник
          </Label>
          <Select value={searchParams.get("source") ?? ANY} onValueChange={(value) => apply({ source: value })}>
            <SelectTrigger id="filter-source" className="w-40">
              <SelectValue placeholder="Любой" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Любой</SelectItem>
              {sources.map((source) => (
                <SelectItem key={source.id} value={source.id}>
                  {source.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="filter-payment">
            Оплата
          </Label>
          <Select value={searchParams.get("payment") ?? ANY} onValueChange={(value) => apply({ payment: value })}>
            <SelectTrigger id="filter-payment" className="w-40">
              <SelectValue placeholder="Любая" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Любая</SelectItem>
              {PAYMENTS.map((payment) => (
                <SelectItem key={payment.value} value={payment.value}>
                  {payment.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="filter-from">
            Создан с
          </Label>
          <Input
            id="filter-from"
            type="date"
            className="w-40"
            defaultValue={searchParams.get("from") ?? ""}
            onChange={(event) => apply({ from: event.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="filter-to">
            по
          </Label>
          <Input
            id="filter-to"
            type="date"
            className="w-40"
            defaultValue={searchParams.get("to") ?? ""}
            onChange={(event) => apply({ to: event.target.value })}
          />
        </div>

        {hasFilters ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Сброс чистит и память — иначе фильтры вернулись бы на следующем заходе
              writeSaved(null);
              router.push("/orders");
            }}
          >
            <X />
            Сбросить
          </Button>
        ) : null}
      </div>
    </div>
  );
}
