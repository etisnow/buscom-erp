import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256=";

/** Подпись сырого тела запроса — тем же способом, каким её считает сайт. */
export function signPayload(rawBody: string, secret: string): string {
  return PREFIX + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * Проверка заголовка `X-Signature`. Сравнение в постоянном времени, чтобы по скорости
 * ответа нельзя было подбирать подпись побайтово (PRD, «Безопасность»).
 */
export function verifySignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;

  const expected = Buffer.from(signPayload(rawBody, secret), "utf8");
  const received = Buffer.from(header.trim(), "utf8");

  // timingSafeEqual требует одинаковой длины — разную длину отбрасываем сразу.
  if (expected.length !== received.length) return false;
  return timingSafeEqual(expected, received);
}
