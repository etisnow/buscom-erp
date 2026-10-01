/**
 * Корзина сайта без схем проверки — то, что нужно браузеру: состав, лимиты, сложение
 * позиций, перевозчики. Zod сюда не подключается: модуль попадает в шапку каждой
 * страницы (значок корзины), а библиотека проверки весит ~60 КБ сжатого кода.
 * Схемы оформления заказа — в `./cart.ts`, их проверяет сервер.
 */

export const MAX_CART_LINES = 50;
export const MAX_QUANTITY = 999;

export type CartLine = { productId: string; valueIds: string[]; quantity: number };

const isId = (value: unknown): value is string => typeof value === "string" && value.length >= 1 && value.length <= 64;

/** Позиция корзины из чужих данных (localStorage, тело запроса) или null, если не годится. */
export function parseCartLine(value: unknown): CartLine | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { productId, valueIds, quantity } = value as Record<string, unknown>;
  if (!isId(productId)) return null;
  if (!Array.isArray(valueIds) || valueIds.length > 20 || !valueIds.every(isId)) return null;
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY)
    return null;
  return { productId, valueIds: [...valueIds], quantity };
}

/** Вся корзина или null: битая позиция или слишком много позиций — корзина не принимается целиком. */
export function parseCart(value: unknown): CartLine[] | null {
  if (!Array.isArray(value) || value.length > MAX_CART_LINES) return null;
  const lines: CartLine[] = [];
  for (const item of value) {
    const line = parseCartLine(item);
    if (!line) return null;
    lines.push(line);
  }
  return lines;
}

/** Одна позиция — один товар с одним набором опций: одинаковые складываются. */
export function cartLineKey(line: Pick<CartLine, "productId" | "valueIds">): string {
  return `${line.productId}:${[...line.valueIds].sort().join(",")}`;
}

export function addToCart(cart: readonly CartLine[], line: CartLine): CartLine[] {
  const key = cartLineKey(line);
  const existing = cart.find((item) => cartLineKey(item) === key);
  if (!existing) return [...cart, line].slice(-MAX_CART_LINES);
  return cart.map((item) =>
    item === existing ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + line.quantity) } : item,
  );
}

/** Перевозчики — как в справочнике ТК ERP (решение владельца 24.09.2026). */
export const CARRIERS = ["СДЭК", "Деловые линии", "ПЭК", "КИТ (GTD)"] as const;
