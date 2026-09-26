"use client";

import Link from "next/link";
import { useCart } from "./cart-store";

export function CartLink() {
  const count = useCart().reduce((sum, line) => sum + line.quantity, 0);
  return (
    <Link
      href="/korzina"
      className="border-line hover:border-brand hover:text-brand relative rounded-md border px-4 py-2 font-medium"
    >
      Корзина
      {count > 0 && (
        <span className="bg-accent ml-2 rounded-full px-2 py-0.5 text-xs font-semibold text-white">{count}</span>
      )}
    </Link>
  );
}
