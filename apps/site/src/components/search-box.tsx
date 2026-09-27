"use client";

import { usePathname, useSearchParams } from "next/navigation";

/**
 * Поиск в шапке. На странице выдачи в поле стоит текущий запрос — его удобно
 * поправить, а не набирать заново. Обычная GET-форма: работает и без JavaScript.
 */
export function SearchBox() {
  const pathname = usePathname();
  const params = useSearchParams();
  const query = pathname === "/poisk" ? (params.get("q") ?? "") : "";
  return <SearchForm key={query} query={query} />;
}

export function SearchForm({ query = "" }: { query?: string }) {
  return (
    <form action="/poisk" role="search" className="order-last flex w-full grow md:order-none md:w-auto">
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder="Поиск: название или код товара"
        aria-label="Поиск по каталогу"
        maxLength={100}
        className="border-line focus:border-brand min-w-0 grow rounded-l-md border bg-white px-3 py-2 text-sm outline-none"
      />
      <button
        type="submit"
        className="bg-brand hover:bg-brand-hover rounded-r-md px-4 py-2 text-sm font-semibold text-white"
      >
        Найти
      </button>
    </form>
  );
}
