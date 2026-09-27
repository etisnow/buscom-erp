"use client";

import Link from "next/link";
import { useCart } from "./cart-store";

/** Число штук в корзине — для значка в шапке и нижней панели. */
export function useCartCount(): number {
  return useCart().reduce((sum, line) => sum + line.quantity, 0);
}

/** Значок корзины из макета: сумка со счётчиком в оранжевом кружке. */
export function CartIcon({ count }: { count: number }) {
  return (
    <span aria-hidden className="border-ink relative block h-[18px] w-[22px] rounded-[3px_3px_7px_7px] border-2">
      <span className="bg-accent text-ink absolute -top-2.5 -right-3 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] text-[11px] font-bold">
        {count}
      </span>
    </span>
  );
}

export function CartLink() {
  const count = useCartCount();
  return (
    <Link
      href="/korzina"
      aria-label={`Корзина, товаров: ${count}`}
      className="bg-field hover:text-brand flex h-11 shrink-0 items-center gap-2.5 rounded-[10px] px-3.5 text-sm font-medium lg:h-12 lg:px-4"
    >
      <CartIcon count={count} />
      <span className="hidden lg:inline">Корзина</span>
    </Link>
  );
}
