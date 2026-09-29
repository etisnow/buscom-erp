"use client";

import Link from "next/link";
import { useState } from "react";
import { ecommerce, reachGoal } from "@/components/analytics/metrika";
import { cartActions } from "@/components/cart/cart-store";
import type { ProductCard } from "@/server/catalog";

/**
 * «В корзину» из списка (макет, экраны 01 и 02). Товар с обязательной опцией без
 * выбора не положить — для него кнопка ведёт в карточку.
 */
export function AddToCartButton({ product, wide }: { product: ProductCard; wide?: boolean }) {
  const [added, setAdded] = useState(false);
  const base = `flex h-11 shrink-0 md:h-9 items-center justify-center rounded-lg px-3 text-[13px] font-semibold ${wide ? "w-full md:w-auto" : ""}`;
  if (product.needsChoice || product.priceKopecks <= 0) {
    return (
      <Link href={`/${product.slug}`} className={`${base} border-accent text-ink hover:bg-accent-soft border`}>
        Выбрать
      </Link>
    );
  }
  if (added) {
    return (
      <Link href="/korzina" className={`${base} bg-brand-soft text-brand`}>
        В корзине ✓
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        cartActions.add({ productId: product.id, valueIds: [], quantity: 1 });
        setAdded(true);
        reachGoal("add_to_cart");
        ecommerce({
          add: { products: [{ id: product.sku, name: product.name, price: product.priceKopecks / 100, quantity: 1 }] },
        });
      }}
      className={`${base} bg-accent hover:bg-accent-hover text-ink`}
    >
      В корзину
    </button>
  );
}
