import Link from "next/link";
import {
  CATALOG_SORT_LABELS,
  CATALOG_SORTS,
  catalogQueryHref,
  isCatalogQueryActive,
  type CatalogQuery,
} from "@buscom/domain/site/catalog-query";
import { COMPANY } from "@/config/company";
import { FiltersToggle } from "./filters-toggle";

/** Сколько фильтров включено — число на кнопке «Фильтры» на телефоне */
function activeFilters(query: CatalogQuery): number {
  return (query.model !== null ? 1 : 0) + (query.minRub !== null || query.maxRub !== null ? 1 : 0);
}

/**
 * Колонка фильтров категории (макет, экран 02): цена, модель, плашка для автопарков.
 * Обычная GET-форма — работает без JavaScript, результат живёт в адресе.
 * «Тип» из макета — это подкатегории, они плашками над списком. «Только в наличии» —
 * когда у товара появится признак наличия (docs/SITE-PRD.md).
 */
export function CategoryFilters({
  slug,
  query,
  models,
}: {
  slug: string;
  query: CatalogQuery;
  models: { model: string; count: number }[];
}) {
  const field =
    "border-line-strong focus:border-brand h-11 w-full min-w-0 rounded-[9px] border bg-white px-3 text-sm outline-none";
  const chip =
    "border-line-strong peer-checked:bg-brand peer-checked:border-brand peer-focus-visible:outline-brand hover:border-brand flex h-8 cursor-pointer items-center rounded-full border px-3 text-[13px] peer-checked:text-white peer-focus-visible:outline-2";
  return (
    <FiltersToggle active={activeFilters(query)}>
      <form action={`/${slug}`} className="card mt-3 flex flex-col gap-6 p-5 lg:mt-0">
        {query.sort !== "popular" && <input type="hidden" name="sort" value={query.sort} />}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-[15px] font-semibold">Цена, ₽</legend>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="min"
              inputMode="numeric"
              defaultValue={query.minRub ?? ""}
              placeholder="от"
              aria-label="Цена от"
              className={field}
            />
            <input
              name="max"
              inputMode="numeric"
              defaultValue={query.maxRub ?? ""}
              placeholder="до"
              aria-label="Цена до"
              className={field}
            />
          </div>
        </fieldset>
        {models.length > 0 && (
          <fieldset>
            <legend className="mb-3 text-[15px] font-semibold">Подходит для</legend>
            <div className="flex flex-wrap gap-1.5">
              <label>
                <input
                  type="radio"
                  name="model"
                  value=""
                  defaultChecked={query.model === null}
                  className="peer sr-only"
                />
                <span className={chip}>Все модели</span>
              </label>
              {models.map(({ model, count }) => (
                <label key={model}>
                  <input
                    type="radio"
                    name="model"
                    value={model}
                    defaultChecked={query.model === model}
                    className="peer sr-only"
                  />
                  <span className={chip}>
                    {model} <span className="ml-1 opacity-60">{count}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="bg-brand hover:bg-brand-hover h-11 grow rounded-[9px] px-4 text-sm font-semibold text-white"
          >
            Показать
          </button>
          {isCatalogQueryActive(query) && (
            <Link href={`/${slug}`} className="text-muted hover:text-brand text-sm">
              Сбросить
            </Link>
          )}
        </div>
        <p className="bg-accent-soft rounded-[10px] p-3.5 text-[13px] leading-normal">
          Нужно много мест на автопарк?{" "}
          <strong className="font-semibold">Напишите в Max {COMPANY.max.display} — дадим оптовую цену.</strong>
        </p>
      </form>
    </FiltersToggle>
  );
}

/** Вкладки сортировки над списком (макет, экран 02): ссылки, фильтры в адресе сохраняются. */
export function SortTabs({ slug, query }: { slug: string; query: CatalogQuery }) {
  return (
    <nav aria-label="Сортировка" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
      <ul className="flex gap-1 whitespace-nowrap">
        {CATALOG_SORTS.map((sort) => (
          <li key={sort}>
            <Link
              href={catalogQueryHref(`/${slug}`, { ...query, sort })}
              aria-current={query.sort === sort ? "true" : undefined}
              className={`flex h-9 items-center rounded-lg px-3.5 text-sm ${
                query.sort === sort ? "bg-ink font-semibold text-white" : "text-ink-2 hover:text-brand"
              }`}
            >
              {sort === "popular" ? "По популярности" : CATALOG_SORT_LABELS[sort]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
