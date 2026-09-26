"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Редкий блок страницы, свёрнутый на телефоне: вместо длинного содержимого —
 * строка-кнопка, по нажатию блок раскрывается целиком (со своим заголовком).
 * На компьютере блок виден всегда, обёртка ничего не меняет.
 */
export function MobileCollapsible({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open ? null : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-11 items-center gap-2 rounded-lg border px-4 py-3 text-left md:hidden"
        >
          <span className="font-heading font-medium">{title}</span>
          {hint ? <span className="text-muted-foreground text-sm">{hint}</span> : null}
          <ChevronDown className="text-muted-foreground ml-auto size-4" />
        </button>
      )}
      <div className={open ? "contents" : "contents max-md:hidden"}>{children}</div>
    </>
  );
}
