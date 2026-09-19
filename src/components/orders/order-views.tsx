import Link from "next/link";
import { ORDER_VIEW_LABELS, type OrderView } from "@/server/orders/list";

const VIEWS: OrderView[] = ["all", "mine", "unassigned", "to-ship", "overdue"];

/**
 * Вкладки-виды. Обычные ссылки, а не состояние компонента: вид, фильтры и страница
 * живут в URL, поэтому список можно переслать коллеге и вернуть кнопкой «назад».
 */
export function OrderViews({
  current,
  counts,
  params,
}: {
  current: OrderView;
  counts: Record<OrderView, number>;
  params: URLSearchParams;
}) {
  return (
    <nav className="flex flex-wrap gap-1" aria-label="Виды списка">
      {VIEWS.map((view) => {
        const next = new URLSearchParams(params);
        next.set("view", view);
        next.delete("page");
        const isActive = view === current;

        return (
          <Link
            key={view}
            href={`/orders?${next.toString()}`}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium"
                : "hover:bg-accent rounded-md px-3 py-1.5 text-sm"
            }
          >
            {ORDER_VIEW_LABELS[view]}
            <span className={isActive ? "ml-1.5 opacity-80" : "text-muted-foreground ml-1.5"}>{counts[view]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
