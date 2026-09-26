import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Пагинация списков ссылками: страница остаётся в URL вместе с фильтрами, поэтому
 * её видно в адресе и можно переслать. Одна на все списки — заказы, клиенты, товары:
 * раньше компонент был только у заказов и вёл на `/orders` жёстко, из-за чего на
 * других экранах страницы не переключались вовсе.
 */
export function ListPagination({
  page,
  pageCount,
  total,
  params,
  basePath,
  label,
}: {
  page: number;
  pageCount: number;
  total: number;
  params: URLSearchParams;
  /** Куда ведут ссылки: `/orders`, `/customers`, `/products`. */
  basePath: string;
  /** «Всего заказов», «Всего клиентов» — родительный падеж уже в строке. */
  label: string;
}) {
  function hrefFor(target: number) {
    const next = new URLSearchParams(params);
    if (target <= 1) next.delete("page");
    else next.set("page", String(target));

    const query = next.toString();
    return query ? `${basePath}?${query}` : basePath;
  }

  const linkClass = "hover:bg-accent inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm";
  const disabledClass =
    "text-muted-foreground inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-sm opacity-50";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-muted-foreground text-sm">
        {label}: {total}
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
