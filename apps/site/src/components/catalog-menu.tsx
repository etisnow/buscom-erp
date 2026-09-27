"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { COMPANY } from "@/config/company";
import type { MenuCategory } from "@/server/catalog";

/** Нижняя панель на телефоне открывает меню этим событием (кнопки «Каталог» в шапке там нет). */
export const CATALOG_TOGGLE_EVENT = "buscom-catalog-toggle";
/** Кнопки с этим атрибутом переключают меню сами — щелчок по ним не считается «мимо». */
export const CATALOG_TOGGLE_ATTR = "data-catalog-toggle";

/**
 * Мега-меню каталога (макет, экран 01): разделы колонками с подкатегориями и
 * плашка «подберём по фото». На десктопе — панель под шапкой, на телефоне — во
 * весь экран над нижней панелью. Закрывается по Escape, щелчку мимо и переходу
 * по ссылке. Без JavaScript кнопка не работает, но разделы остаются ссылками в шапке.
 */
export function CatalogMenu({ tree }: { tree: MenuCategory[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onToggle = () => setOpen((value) => !value);
    window.addEventListener(CATALOG_TOGGLE_EVENT, onToggle);
    return () => window.removeEventListener(CATALOG_TOGGLE_EVENT, onToggle);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!root.current?.contains(target) && !target.closest(`[${CATALOG_TOGGLE_ATTR}]`)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={root} className="contents">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="catalog-menu"
        onClick={() => setOpen(!open)}
        className="bg-brand hover:bg-brand-hover hidden h-12 shrink-0 items-center gap-2.5 rounded-[10px] px-5 text-[15px] font-semibold text-white lg:flex"
      >
        {open ? (
          <span aria-hidden className="w-4 text-center text-xl leading-none">
            ×
          </span>
        ) : (
          <span aria-hidden className="flex w-4 flex-col gap-[3px]">
            <span className="h-0.5 w-4 bg-white" />
            <span className="h-0.5 w-4 bg-white" />
            <span className="bg-accent h-0.5 w-[11px]" />
          </span>
        )}
        Каталог
      </button>
      {open && (
        <div
          id="catalog-menu"
          // Переход по ссылке меню закрывает его, даже если это текущая страница
          onClick={(event) => (event.target as HTMLElement).closest("a") && setOpen(false)}
          className="fixed inset-x-0 top-0 bottom-16 z-40 overflow-y-auto bg-white lg:absolute lg:top-full lg:bottom-auto lg:max-h-[80vh] lg:bg-transparent"
        >
          <div className="wrap">
            <div className="grid gap-8 py-6 lg:grid-cols-[repeat(4,minmax(0,1fr))_300px] lg:rounded-b-2xl lg:bg-white lg:p-8 lg:shadow-[0_24px_48px_rgba(21,25,30,.16)]">
              <div className="flex items-center justify-between lg:hidden">
                <p className="text-xl font-bold">Каталог</p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-muted text-2xl"
                  aria-label="Закрыть"
                >
                  ×
                </button>
              </div>
              {tree.map((section) => (
                <div key={section.id} className="flex flex-col gap-2.5">
                  <Link href={`/${section.slug}`} className="hover:text-brand font-bold">
                    {section.name} <span className="text-subtle text-sm font-normal">{section.productCount}</span>
                  </Link>
                  {section.children.map((child) => (
                    <Link key={child.id} href={`/${child.slug}`} className="text-ink-2 hover:text-brand text-sm">
                      {child.name}
                    </Link>
                  ))}
                </div>
              ))}
              <div className="bg-brand-soft flex flex-col justify-between gap-2.5 rounded-xl p-5">
                <p className="text-[17px] leading-snug font-bold">Не нашли нужную деталь?</p>
                <p className="text-ink-2 text-sm leading-normal">
                  Пришлите фото или модель автомобиля в Max — подберём и назовём цену.
                </p>
                <p className="bg-brand flex h-10 items-center justify-center rounded-lg text-sm font-semibold text-white">
                  Max: {COMPANY.max.display}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Кнопка вне шапки, открывающая мега-меню (например, «Весь каталог» на главной). */
export function CatalogToggle({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      {...{ [CATALOG_TOGGLE_ATTR]: "" }}
      onClick={() => {
        window.scrollTo({ top: 0 });
        window.dispatchEvent(new Event(CATALOG_TOGGLE_EVENT));
      }}
      className={className}
    >
      {children}
    </button>
  );
}
