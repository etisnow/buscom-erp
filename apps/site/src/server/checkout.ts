import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";
import {
  buildSiteOrderPayload,
  cartSchema,
  checkoutSchema,
  priceCart,
  type CatalogProduct,
  type CartLine,
  type PricedCart,
} from "@buscom/domain/site/cart";
import { SlidingWindowLimiter } from "@buscom/domain/site/rate-limit";
import { db } from "@/server/db";

/**
 * Корзина и заказ на стороне сервера сайта. Цены — из базы на момент запроса,
 * не из браузера и не из кеша каталога: в заказ не должна попасть устаревшая цена.
 * Заказ уходит в ERP по её API с HMAC-подписью (контракт v1) — там и заводится,
 * со снимком позиций, клиентом по телефону и журналом (docs/DECISIONS.md,
 * запись от 26.09 про корзину сайта).
 */

/** Переменные только для оформления: без них каталог работает, а заказ — нет. */
const checkoutEnvSchema = z.object({
  /** ERP изнутри сети compose (`http://app:3000`), на машине разработки — `http://localhost:3000` */
  ERP_API_URL: z.url(),
  /** Тот же секрет, что `SITE_WEBHOOK_SECRET` у ERP */
  SITE_WEBHOOK_SECRET: z.string().min(32),
});

/**
 * Защита ERP от потока заказов: 5 отправок за 10 минут с одного IP и 60 в час на
 * весь сайт (на случай спама с многих адресов). Засчитываются только отправки,
 * прошедшие проверку формы и корзины, — опечатки лимит не тратят.
 */
const perIp = new SlidingWindowLimiter(5, 10 * 60 * 1000);
const overall = new SlidingWindowLimiter(60, 60 * 60 * 1000);

async function loadProducts(ids: string[]): Promise<Map<string, CatalogProduct>> {
  const products = await db.product.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: {
      id: true,
      sku: true,
      name: true,
      slug: true,
      isActive: true,
      priceKopecks: true,
      options: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          required: true,
          values: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, priceDeltaKopecks: true } },
        },
      },
    },
  });
  return new Map(products.map(({ options, ...product }) => [product.id, { ...product, groups: options }]));
}

export async function priceCartFromInput(input: unknown): Promise<PricedCart> {
  const cart = cartSchema.safeParse(input);
  if (!cart.success) return { lines: [], totalKopecks: 0, dropped: [] };
  return priceCart(cart.data, await loadProducts(cart.data.map((line) => line.productId)));
}

export type PlaceOrderResult =
  | { ok: true; orderNumber: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; cart?: PricedCart };

/** `ip` — адрес покупателя из заголовков прокси; неизвестен — действует только общий лимит. */
export async function placeOrder(cartInput: unknown, formInput: unknown, ip: string | null): Promise<PlaceOrderResult> {
  const form = checkoutSchema.safeParse(formInput);
  if (!form.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of form.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, error: "Проверьте поля формы", fieldErrors };
  }
  const parsedCart = cartSchema.safeParse(cartInput);
  if (!parsedCart.success || parsedCart.data.length === 0) {
    return { ok: false, error: "Корзина пуста или устарела — обновите страницу" };
  }
  const cart = priceCart(parsedCart.data, await loadProducts(parsedCart.data.map((line: CartLine) => line.productId)));
  if (cart.dropped.length > 0 || cart.lines.length === 0) {
    return { ok: false, error: "Часть товаров изменилась — проверьте корзину и отправьте заказ ещё раз", cart };
  }

  if ((ip && !perIp.take(ip)) || !overall.take("all")) {
    console.warn(`[checkout] Лимит заказов: ${ip ?? "IP неизвестен"}`);
    return { ok: false, error: "Слишком много заказов подряд. Подождите несколько минут или позвоните нам" };
  }

  const env = checkoutEnvSchema.safeParse(process.env);
  if (!env.success) {
    console.error("[checkout] Не настроена связь с ERP (ERP_API_URL, SITE_WEBHOOK_SECRET)");
    return { ok: false, error: "Не удалось отправить заказ. Позвоните нам — оформим по телефону" };
  }

  const body = JSON.stringify(buildSiteOrderPayload(form.data, cart));
  const signature = "sha256=" + createHmac("sha256", env.data.SITE_WEBHOOK_SECRET).update(body, "utf8").digest("hex");
  try {
    const response = await fetch(new URL("/api/integrations/site/orders", env.data.ERP_API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Signature": signature },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    // 201 — заказ создан, 200 — эта же форма уже отправлялась (повторное нажатие)
    if (response.status === 201 || response.status === 200) {
      const result = (await response.json()) as { orderNumber: number };
      return { ok: true, orderNumber: result.orderNumber };
    }
    console.error(`[checkout] ERP ответила ${response.status}: ${await response.text()}`);
  } catch (error) {
    console.error("[checkout] ERP недоступна", error);
  }
  return { ok: false, error: "Не удалось отправить заказ. Попробуйте ещё раз или позвоните нам" };
}
