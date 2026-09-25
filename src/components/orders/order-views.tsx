import Link from "next/link";
import { ORDER_VIEW_LABELS, VISIBLE_ORDER_VIEWS, type OrderView } from "@/server/orders/list";

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
      {VISIBLE_ORDER_VIEWS.map((view) => {
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
                ? "bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium max-md:py-2.5"
                : "hover:bg-accent rounded-md px-3 py-1.5 text-sm max-md:py-2.5"
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
