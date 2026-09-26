import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_PRESET_LABELS, PERIOD_PRESETS, lastDayInclusive, type Period } from "@buscom/domain/analytics/period";
import { toDateInput } from "@buscom/domain/datetime";
import { cn } from "@/lib/utils";

/**
 * Выбор периода: пресеты ссылками и даты «с — по» обычной GET-формой. Состояние
 * живёт в адресе, как у списков: ссылку на отчёт за период можно переслать.
 */
export function PeriodPicker({ period }: { period: Period }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
      <nav className="bg-muted flex flex-wrap gap-1 rounded-lg p-1" aria-label="Период">
        {PERIOD_PRESETS.map((preset) => (
          <Link
            key={preset}
            href={`/analytics?period=${preset}`}
            aria-current={period.preset === preset ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm max-md:py-2.5",
              period.preset === preset
                ? "bg-background font-medium shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {PERIOD_PRESET_LABELS[preset]}
          </Link>
        ))}
      </nav>
      <form method="get" action="/analytics" className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="analytics-from" className="text-muted-foreground text-xs">
            С
          </Label>
          <Input
            id="analytics-from"
            type="date"
            name="from"
            className="h-8 w-40"
            defaultValue={period.from ? toDateInput(period.from) : ""}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="analytics-to" className="text-muted-foreground text-xs">
            По
          </Label>
          <Input
            id="analytics-to"
            type="date"
            name="to"
            className="h-8 w-40"
            defaultValue={toDateInput(lastDayInclusive(period.to))}
          />
        </div>
        <Button type="submit" size="sm" variant={period.preset === null ? "default" : "outline"}>
          Показать
        </Button>
      </form>
    </div>
  );
}
