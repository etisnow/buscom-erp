import Link from "next/link";
import {
  CATALOG_SORT_LABELS,
  CATALOG_SORTS,
  isCatalogQueryActive,
  type CatalogQuery,
} from "@buscom/domain/site/catalog-query";

/**
 * Фильтры категории: модель, цена, сортировка (docs/SITE-PRD.md, «02 · Категория»).
 * Обычная GET-форма — работает без JavaScript, результат живёт в адресе.
 * «Тип» из макета — это подкатегории, они плитками над списком.
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
  const field = "border-line focus:border-brand rounded-md border bg-white px-3 py-2 text-sm outline-none";
  return (
    <form action={`/${slug}`} className="bg-surface flex flex-wrap items-end gap-3 rounded-lg p-4">
      {models.length > 0 && (
        <label className="flex min-w-48 grow flex-col gap-1 text-sm sm:grow-0">
          <span className="text-muted">Подходит для</span>
          <select name="model" defaultValue={query.model ?? ""} className={field}>
            <option value="">Все модели</option>
            {models.map(({ model, count }) => (
              <option key={model} value={model}>
                {model} ({count})
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className="flex flex-col gap-1 text-sm">
        <legend className="text-muted mb-1">Цена, ₽</legend>
        <div className="flex items-center gap-2">
          <input
            name="min"
            inputMode="numeric"
            defaultValue={query.minRub ?? ""}
            placeholder="от"
            aria-label="Цена от"
            className={`${field} w-24`}
          />
          <span className="text-subtle">—</span>
          <input
            name="max"
            inputMode="numeric"
            defaultValue={query.maxRub ?? ""}
            placeholder="до"
            aria-label="Цена до"
            className={`${field} w-24`}
          />
        </div>
      </fieldset>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Сортировка</span>
        <select name="sort" defaultValue={query.sort} className={field}>
          {CATALOG_SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {CATALOG_SORT_LABELS[sort]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="bg-brand hover:bg-brand-hover rounded-md px-4 py-2 text-sm font-semibold text-white"
        >
          Показать
        </button>
        {isCatalogQueryActive(query) && (
          <Link href={`/${slug}`} className="text-muted hover:text-brand text-sm">
            Сбросить
          </Link>
        )}
      </div>
    </form>
  );
}
