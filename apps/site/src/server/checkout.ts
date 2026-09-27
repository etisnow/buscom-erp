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
import { checkInn } from "@buscom/domain/customer/company-lookup";
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

  try {
    const response = await postToErp("/api/integrations/site/orders", buildSiteOrderPayload(form.data, cart));
    if (!response) return { ok: false, error: "Не удалось отправить заказ. Позвоните нам — оформим по телефону" };
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

/**
 * Подписанный запрос в ERP (контракт v1: HMAC сырого тела в `X-Signature`).
 * `null` — связь с ERP не настроена; сбой сети — исключение.
 */
async function postToErp(path: string, payload: unknown): Promise<Response | null> {
  const env = checkoutEnvSchema.safeParse(process.env);
  if (!env.success) {
    console.error("[checkout] Не настроена связь с ERP (ERP_API_URL, SITE_WEBHOOK_SECRET)");
    return null;
  }
  const body = JSON.stringify(payload);
  const signature = "sha256=" + createHmac("sha256", env.data.SITE_WEBHOOK_SECRET).update(body, "utf8").digest("hex");
  return fetch(new URL(path, env.data.ERP_API_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Signature": signature },
    body,
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Поиск реквизитов по ИНН — публичная кнопка, а у DaData дневная квота: 10 запросов
 * за 10 минут с IP и 200 в час на сайт. Реквизиты всегда можно вписать руками.
 */
const lookupPerIp = new SlidingWindowLimiter(10, 10 * 60 * 1000);
const lookupOverall = new SlidingWindowLimiter(200, 60 * 60 * 1000);

const companyResponseSchema = z.union([
  z.object({ ok: z.literal(true), company: z.object({ name: z.string(), kpp: z.string(), active: z.boolean() }) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

export type CompanyLookup = z.infer<typeof companyResponseSchema>;

export async function lookupCompany(inn: unknown, ip: string | null): Promise<CompanyLookup> {
  const unavailable = { ok: false as const, error: "Не удалось найти реквизиты — впишите их вручную" };
  if (typeof inn !== "string" || inn.length > 20) return { ok: false, error: "Впишите ИНН" };
  // Опечатку ловим здесь: она не тратит лимит и не ходит в ERP
  const checked = checkInn(inn);
  if (!checked.ok) return checked;
  if ((ip && !lookupPerIp.take(ip)) || !lookupOverall.take("all")) {
    return { ok: false, error: "Слишком много запросов — впишите реквизиты вручную" };
  }
  try {
    const response = await postToErp("/api/integrations/site/company", { inn: checked.inn });
    if (!response?.ok) {
      if (response) console.error(`[checkout] Реквизиты по ИНН: ERP ответила ${response.status}`);
      return unavailable;
    }
    const result = companyResponseSchema.safeParse(await response.json());
    return result.success ? result.data : unavailable;
  } catch (error) {
    console.error("[checkout] Реквизиты по ИНН: ERP недоступна", error);
    return unavailable;
  }
}
