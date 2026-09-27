import "server-only";
import { createHmac } from "node:crypto";
import { z } from "zod";

/**
 * Связь сайта с ERP: заказы, реквизиты по ИНН, заявки. Сайт в базу не пишет — всё,
 * что меняет данные, идёт в ERP по её API с HMAC-подписью (контракт v1, PRD).
 */

/** Без этих переменных каталог работает, а заказы и формы — нет. */
const erpEnvSchema = z.object({
  /** ERP изнутри сети compose (`http://app:3000`), на машине разработки — `http://localhost:3000` */
  ERP_API_URL: z.url(),
  /** Тот же секрет, что `SITE_WEBHOOK_SECRET` у ERP */
  SITE_WEBHOOK_SECRET: z.string().min(32),
});

/**
 * Подписанный запрос в ERP (HMAC сырого тела в `X-Signature`).
 * `null` — связь с ERP не настроена; сбой сети — исключение.
 */
export async function postToErp(path: string, payload: unknown): Promise<Response | null> {
  const env = erpEnvSchema.safeParse(process.env);
  if (!env.success) {
    console.error("[erp] Не настроена связь с ERP (ERP_API_URL, SITE_WEBHOOK_SECRET)");
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
