"use client";

import { useState, type ReactNode } from "react";

/**
 * Фильтры категории на телефоне прячутся за кнопкой «Фильтры» (макет, экран 02,
 * мобильный); на десктопе колонка видна всегда.
 */
export function FiltersToggle({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="category-filters"
        onClick={() => setOpen(!open)}
        className="card flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium lg:hidden"
      >
        Фильтры
        {active > 0 && (
          <span className="bg-brand flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white">
            {active}
          </span>
        )}
      </button>
      <div id="category-filters" className={open ? "" : "max-lg:hidden"}>
        {children}
      </div>
    </>
  );
}
