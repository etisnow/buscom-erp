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
    <form
      action="/poisk"
      role="search"
      className="border-brand order-last flex h-12 w-full items-center gap-3 rounded-[10px] border-2 bg-white pr-[5px] pl-4 lg:order-none lg:w-auto lg:flex-1"
    >
      <input
        type="search"
        name="q"
        defaultValue={query}
        placeholder="Сиденье, шторки, код"
        aria-label="Поиск по каталогу"
        maxLength={100}
        className="placeholder:text-subtle min-w-0 grow bg-transparent text-[15px] outline-none"
      />
      <button
        type="submit"
        className="bg-brand hover:bg-brand-hover h-9 shrink-0 rounded-[7px] px-[18px] text-sm font-semibold text-white"
      >
        Найти
      </button>
    </form>
  );
}
