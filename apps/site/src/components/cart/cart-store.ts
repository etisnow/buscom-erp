"use client";

import { useSyncExternalStore } from "react";
import { addToCart, cartSchema, type CartLine } from "@buscom/domain/site/cart";

/**
 * Корзина в браузере (localStorage): только что выбрано — товар, опции, количество.
 * Цены здесь не хранятся: их каждый раз считает сервер. Вкладки синхронизируются
 * через событие `storage`, в пределах вкладки — своим событием.
 */
const KEY = "buscom-cart";
const EVENT = "buscom-cart-change";
const EMPTY: CartLine[] = [];

let cached: { raw: string | null; cart: CartLine[] } = { raw: null, cart: EMPTY };

function read(): CartLine[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cached.raw) return cached.cart;
  const parsed = cartSchema.safeParse(raw ? JSON.parse(raw) : []);
  cached = { raw, cart: parsed.success ? parsed.data : EMPTY };
  return cached.cart;
}

function write(cart: CartLine[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    // Приватный режим или запрет хранилища — корзина живёт до перезагрузки страницы
    cached = { raw: JSON.stringify(cart), cart };
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export const cartActions = {
  add(line: CartLine) {
    write(addToCart(read(), line));
  },
  setQuantity(index: number, quantity: number) {
    write(read().map((line, i) => (i === index ? { ...line, quantity } : line)));
  },
  remove(index: number) {
    write(read().filter((_, i) => i !== index));
  },
  clear() {
    write([]);
  },
};
