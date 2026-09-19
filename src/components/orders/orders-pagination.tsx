import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** Пагинация ссылками: страница остаётся в URL вместе с фильтрами. */
export function OrdersPagination({
  page,
  pageCount,
  total,
  params,
}: {
  page: number;
  pageCount: number;
  total: number;
  params: URLSearchParams;
}) {
  function hrefFor(target: number) {
    const next = new URLSearchParams(params);
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));
    return `/orders?${next.toString()}`;
  }

  const linkClass = "hover:bg-accent inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm";
  const disabledClass =
    "text-muted-foreground inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm opacity-50";

  return (
    <div className="flex items-center justify-between">
      <p className="text-muted-foreground text-sm">
        Всего заказов: {total}
        {pageCount > 1 ? ` · страница ${page} из ${pageCount}` : ""}
      </p>

      {pageCount > 1 ? (
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={linkClass}>
              <ChevronLeft className="size-4" />
              Назад
            </Link>
          ) : (
            <span className={disabledClass}>
              <ChevronLeft className="size-4" />
              Назад
            </span>
          )}
          {page < pageCount ? (
            <Link href={hrefFor(page + 1)} className={linkClass}>
              Вперёд
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className={disabledClass}>
              Вперёд
              <ChevronRight className="size-4" />
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
