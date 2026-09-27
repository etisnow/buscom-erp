"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MenuCategory } from "@/server/catalog";

/**
 * Мега-меню каталога (docs/SITE-PRD.md, «01 · Главная»): разделы колонками с
 * подкатегориями. Закрывается по Escape, щелчку мимо и переходу по ссылке.
 * Без JavaScript кнопка не работает, но разделы остаются ссылками рядом с ней.
 */
export function CatalogMenu({ tree }: { tree: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={root}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="catalog-menu"
        onClick={() => setOpen(!open)}
        className="bg-brand hover:bg-brand-hover flex items-center gap-2 rounded-md px-4 py-1.5 font-semibold text-white"
      >
        <span aria-hidden className="text-lg leading-none">
          {open ? "×" : "☰"}
        </span>
        Каталог
      </button>
      {open && (
        <div
          id="catalog-menu"
          // Переход по ссылке меню закрывает его, даже если это текущая страница
          onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(false)}
          className="border-line absolute inset-x-0 top-full z-20 max-h-[80vh] overflow-y-auto border-b bg-white shadow-lg"
        >
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:grid-cols-2 lg:grid-cols-4">
            {tree.map((section) => (
              <div key={section.id}>
                <Link href={`/${section.slug}`} className="hover:text-brand text-base font-semibold">
                  {section.name} <span className="text-subtle text-sm font-normal">{section.productCount}</span>
                </Link>
                {section.children.length > 0 && (
                  <ul className="mt-3 space-y-2 text-sm">
                    {section.children.map((child) => (
                      <li key={child.id}>
                        <Link href={`/${child.slug}`} className="text-ink-2 hover:text-brand">
                          {child.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
