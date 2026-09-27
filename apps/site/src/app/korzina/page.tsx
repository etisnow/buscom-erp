import type { Metadata } from "next";
import { CartView } from "@/components/cart/cart-view";

export const metadata: Metadata = {
  title: "Корзина",
  // Корзина — личная страница покупателя; robots.txt её тоже закрывает
  robots: { index: false, follow: false },
};

/** Экран 04 макета: корзина и оформление заказа. Всё содержимое — в браузере (корзина в localStorage). */
export default function CartPage() {
  return (
    <section>
      <h1 className="page-title mb-4 md:mb-6">Корзина</h1>
      <CartView />
    </section>
  );
}
