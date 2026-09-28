"use server";

import { headers } from "next/headers";
import { clientIp } from "@buscom/domain/site/rate-limit";
import { lookupCompany, placeOrder, placeQuickOrder, priceCartFromInput } from "@/server/checkout";
import { getMapsApiKey } from "@/server/site-config";
import { listTerminals } from "@/server/terminals";

/** Пересчёт корзины по базе — для показа. Вход проверяется схемой в src/server/checkout.ts. */
export async function priceCartAction(cart: unknown) {
  return priceCartFromInput(cart);
}

/** Оформление заказа: форма и корзина проверяются и пересчитываются заново на сервере. */
export async function placeOrderAction(cart: unknown, form: unknown) {
  const list = await headers();
  return placeOrder(cart, form, clientIp(list.get("x-forwarded-for"), list.get("x-real-ip")));
}

/**
 * Пункты выдачи ТК для выбора в оформлении и ключ карты; у ТК без справочника —
 * пустой список, и карта тогда не нужна.
 */
export async function terminalsAction(carrier: unknown) {
  const terminals = typeof carrier === "string" && carrier.length <= 100 ? await listTerminals(carrier) : [];
  return { terminals, mapsApiKey: terminals.length > 0 ? await getMapsApiKey() : null };
}

/** Название и КПП организации по ИНН — через ERP (ключ DaData только там). */
export async function lookupCompanyAction(inn: unknown) {
  const list = await headers();
  return lookupCompany(inn, clientIp(list.get("x-forwarded-for"), list.get("x-real-ip")));
}

/** «Купить в 1 клик» из карточки товара: позиция и форма проверяются на сервере. */
export async function quickOrderAction(line: unknown, form: unknown) {
  const list = await headers();
  return placeQuickOrder(line, form, clientIp(list.get("x-forwarded-for"), list.get("x-real-ip")));
}
