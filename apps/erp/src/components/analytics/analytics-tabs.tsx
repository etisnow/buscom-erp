import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "summary", href: "/analytics", label: "Сводка" },
  { key: "expenses", href: "/analytics/expenses", label: "Расходы" },
] as const;

/** Вкладки раздела «Аналитика»: сводка за период и справочник расходов. */
export function AnalyticsTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="flex gap-4 border-b" aria-label="Раздел аналитики">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={current === tab.key ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 px-1 pb-2 text-sm",
            current === tab.key
              ? "border-primary font-medium"
              : "text-muted-foreground hover:text-foreground border-transparent",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
