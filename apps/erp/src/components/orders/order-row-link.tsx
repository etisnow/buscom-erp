"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "cn";
import { TableRow } from "@/components/ui/table";

/**
 * Строка списка заказов целиком ведёт в карточку — попадать в один только номер было мелко.
 *
 * Ссылка на номере остаётся: она и путь для клавиатуры, и «открыть в новой вкладке»
 * средней кнопкой. Клик по вложенной ссылке или кнопке, а также выделение текста
 * (телефон из строки копируют руками) переходом не считаются.
 */
export function OrderRowLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  return (
    <TableRow
      className={cn("cursor-pointer", className)}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a, button, input, select, label")) return;
        if (window.getSelection()?.toString()) return;
        router.push(href);
      }}
    >
      {children}
    </TableRow>
  );
}
