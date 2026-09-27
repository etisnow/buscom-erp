"use server";

import { headers } from "next/headers";
import { clientIp } from "@buscom/domain/site/rate-limit";
import { lookupCompany, placeOrder, priceCartFromInput } from "@/server/checkout";

/** Пересчёт корзины по базе — для показа. Вход проверяется схемой в src/server/checkout.ts. */
export async function priceCartAction(cart: unknown) {
  return priceCartFromInput(cart);
}

/** Оформление заказа: форма и корзина проверяются и пересчитываются заново на сервере. */
export async function placeOrderAction(cart: unknown, form: unknown) {
  const list = await headers();
  return placeOrder(cart, form, clientIp(list.get("x-forwarded-for"), list.get("x-real-ip")));
}

/** Название и КПП организации по ИНН — через ERP (ключ DaData только там). */
export async function lookupCompanyAction(inn: unknown) {
  const list = await headers();
  return lookupCompany(inn, clientIp(list.get("x-forwarded-for"), list.get("x-real-ip")));
}
