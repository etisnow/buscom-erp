"use server";

import { placeOrder, priceCartFromInput } from "@/server/checkout";

/** Пересчёт корзины по базе — для показа. Вход проверяется схемой в src/server/checkout.ts. */
export async function priceCartAction(cart: unknown) {
  return priceCartFromInput(cart);
}

/** Оформление заказа: форма и корзина проверяются и пересчитываются заново на сервере. */
export async function placeOrderAction(cart: unknown, form: unknown) {
  return placeOrder(cart, form);
}
