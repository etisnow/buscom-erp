import { z } from "zod";
import { normalizePhone } from "../customer/phone";
import type { SiteOrderPayload } from "../integration/contract";
import type { Kopecks } from "../money";
import { buildOptionSnapshot, priceWithOptions, type OptionGroup, type OrderItemOption } from "../product/options";

/**
 * Корзина и оформление заказа на сайте (docs/SITE-PRD.md, «Заказ с сайта»).
 *
 * Корзина живёт в браузере и хранит только что выбрано: товар, варианты опций,
 * количество. Цены и итоги сервер сайта каждый раз считает по базе — суммы из
 * браузера не принимаются (CLAUDE.md). Заказ уходит в ERP по контракту v1
 * (`../integration/contract.ts`) и там заводится, как заказ любого сайта.
 */

export const MAX_CART_LINES = 50;
export const MAX_QUANTITY = 999;

export const cartLineSchema = z.object({
  productId: z.string().min(1).max(64),
  valueIds: z.array(z.string().min(1).max(64)).max(20),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});

export type CartLine = z.infer<typeof cartLineSchema>;

export const cartSchema = z.array(cartLineSchema).max(MAX_CART_LINES);

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

/** Товар из базы — ровно то, что нужно для расчёта позиции. */
export type CatalogProduct = {
  id: string;
  sku: string;
  name: string;
  slug: string | null;
  isActive: boolean;
  priceKopecks: Kopecks;
  groups: OptionGroup[];
};

export type PricedLine = {
  /** Номер строки в корзине браузера — по нему интерфейс сопоставляет пересчёт */
  lineIndex: number;
  productId: string;
  sku: string;
  name: string;
  slug: string | null;
  valueIds: string[];
  options: OrderItemOption[];
  quantity: number;
  unitPriceKopecks: Kopecks;
  totalKopecks: Kopecks;
};

export type PricedCart = {
  lines: PricedLine[];
  totalKopecks: Kopecks;
  /** Позиции, которые больше нельзя заказать, — с причиной для покупателя */
  dropped: { lineIndex: number; productId: string; reason: string }[];
};

/**
 * Пересчёт корзины по каталогу. Товар сняли с продажи или поменяли ему опции —
 * позиция выпадает с понятной причиной, а не падает весь заказ.
 */
export function priceCart(cart: readonly CartLine[], products: ReadonlyMap<string, CatalogProduct>): PricedCart {
  const lines: PricedLine[] = [];
  const dropped: PricedCart["dropped"] = [];
  for (const [lineIndex, line] of cart.entries()) {
    const product = products.get(line.productId);
    if (!product || !product.isActive) {
      dropped.push({ lineIndex, productId: line.productId, reason: "Товар снят с продажи" });
      continue;
    }
    let options: OrderItemOption[];
    try {
      options = buildOptionSnapshot(product.groups, line.valueIds, product.name);
    } catch (error) {
      dropped.push({
        lineIndex,
        productId: line.productId,
        reason: error instanceof Error ? error.message : "Опции товара изменились — выберите заново",
      });
      continue;
    }
    const unitPriceKopecks = priceWithOptions(product.priceKopecks, options);
    lines.push({
      lineIndex,
      productId: product.id,
      sku: product.sku,
      name: product.name,
      slug: product.slug,
      valueIds: options.map((option) => option.valueId),
      options,
      quantity: line.quantity,
      unitPriceKopecks,
      totalKopecks: unitPriceKopecks * line.quantity,
    });
  }
  return { lines, totalKopecks: lines.reduce((sum, line) => sum + line.totalKopecks, 0), dropped };
}

/** Перевозчики — как в справочнике ТК ERP (решение владельца 24.09.2026). */
export const CARRIERS = ["СДЭК", "Деловые линии", "ПЭК", "КИТ (GTD)"] as const;

const trimmed = (max: number) => z.string().trim().max(max);
const optional = (max: number) =>
  trimmed(max)
    .optional()
    .transform((value) => value || undefined);

export const checkoutSchema = z
  .object({
    /** Ключ идемпотентности: повторная отправка той же формы не создаст второй заказ */
    requestId: z.uuid(),
    customerType: z.enum(["PERSON", "COMPANY"]),
    name: trimmed(120).min(2, { error: "Укажите имя" }),
    // Телефон и согласие проверяются в общей проверке ниже: ошибка в них не должна
    // прятать остальные — покупатель видит все ошибки формы сразу
    phone: z.string().max(40),
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((value) => value || undefined)
      .pipe(z.email({ error: "Проверьте адрес почты" }).optional()),
    companyName: optional(300),
    inn: optional(12),
    kpp: optional(9),
    deliveryMethod: z.enum(["PICKUP", "CARRIER"]),
    carrier: z.enum(CARRIERS).optional(),
    address: optional(500),
    comment: optional(2000),
    consent: z.boolean(),
    /** Скрытое поле-ловушка для ботов: человек его не видит и не заполняет */
    website: z.string().max(0, { error: "Ошибка формы — обновите страницу" }).optional(),
  })
  .superRefine((value, ctx) => {
    if (!normalizePhone(value.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Укажите телефон в формате +7 XXX XXX-XX-XX" });
    }
    if (!value.consent) {
      ctx.addIssue({ code: "custom", path: ["consent"], message: "Нужно согласие на обработку персональных данных" });
    }
    if (value.customerType === "COMPANY") {
      if (!value.companyName) ctx.addIssue({ code: "custom", path: ["companyName"], message: "Укажите организацию" });
      if (!value.inn || !/^(\d{10}|\d{12})$/.test(value.inn)) {
        ctx.addIssue({ code: "custom", path: ["inn"], message: "ИНН — 10 или 12 цифр" });
      }
      if (value.kpp && !/^\d{9}$/.test(value.kpp)) {
        ctx.addIssue({ code: "custom", path: ["kpp"], message: "КПП — 9 цифр" });
      }
    }
    if (value.deliveryMethod === "CARRIER") {
      if (!value.carrier)
        ctx.addIssue({ code: "custom", path: ["carrier"], message: "Выберите транспортную компанию" });
      if (!value.address)
        ctx.addIssue({ code: "custom", path: ["address"], message: "Укажите город и адрес доставки" });
    }
  })
  .transform((value) => ({ ...value, phone: normalizePhone(value.phone) as string }));

export type CheckoutInput = z.infer<typeof checkoutSchema>;

/** Заказ в формате контракта v1 для ERP. Цены — из пересчёта по базе, не из браузера. */
export function buildSiteOrderPayload(input: CheckoutInput, cart: PricedCart): SiteOrderPayload {
  const company = input.customerType === "COMPANY";
  return {
    externalId: `web-${input.requestId}`,
    numberedByErp: true,
    customer: {
      type: input.customerType,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      inn: company ? (input.inn ?? null) : null,
      kpp: company ? (input.kpp ?? null) : null,
      companyName: company ? (input.companyName ?? null) : null,
    },
    items: cart.lines.map((line) => ({
      externalProductId: null,
      sku: line.sku,
      name: line.name,
      priceKopecks: line.unitPriceKopecks,
      quantity: line.quantity,
      options: line.options.length > 0 ? line.options : undefined,
    })),
    delivery: {
      method: input.deliveryMethod,
      carrier: input.deliveryMethod === "CARRIER" ? (input.carrier ?? null) : null,
      address: input.deliveryMethod === "CARRIER" ? (input.address ?? null) : null,
      priceKopecks: 0,
    },
    // Онлайн-оплаты нет (решение владельца 24.09.2026): юрлицу — счёт, физлицу
    // способ оплаты согласует менеджер
    payment: { method: company ? "INVOICE" : null, paidKopecks: 0 },
    totalKopecks: cart.totalKopecks,
    comment: input.comment ?? null,
  };
}
