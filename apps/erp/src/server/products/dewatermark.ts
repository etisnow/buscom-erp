import "server-only";
import { detectImageType } from "@buscom/domain/product/images";
import { env } from "@/server/env";

/**
 * Снятие водяного знака со снимка через платный API dewatermark.ai — для импорта
 * товара с сайта поставщика (поставщик разрешил убирать свой знак, 28.09.2026).
 *
 * Сервис перерисовывает участок под знаком нейросетью, поэтому результат всегда
 * смотрит человек: в форме импорта у каждого снимка можно вернуть оригинал.
 * Любая неудача — понятный текст, а не исключение: снимок тогда идёт как есть.
 */
const ENDPOINT = "https://platform.dewatermark.ai/api/object_removal/v2/erase_watermark";
const TIMEOUT_MS = 90_000;

export type DewatermarkResult = { ok: true; data: Uint8Array<ArrayBuffer> } | { ok: false; error: string };

export function isDewatermarkConfigured(): boolean {
  return Boolean(env.DEWATERMARK_API_KEY);
}

export async function removeWatermark(image: Uint8Array<ArrayBuffer>, fileName: string): Promise<DewatermarkResult> {
  const key = env.DEWATERMARK_API_KEY;
  if (!key) return { ok: false, error: "Снятие водяного знака не настроено: нужен ключ DEWATERMARK_API_KEY" };

  const form = new FormData();
  form.append("original_preview_image", new Blob([image], { type: detectImageType(image) ?? "image/jpeg" }), fileName);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "X-API-KEY": key },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "не ответил вовремя" : "нет связи";
    return { ok: false, error: `Сервис снятия знака ${reason}` };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: "Сервис снятия знака не принял ключ — проверьте DEWATERMARK_API_KEY" };
  }
  if (response.status === 402 || response.status === 429) {
    return { ok: false, error: "У сервиса снятия знака кончился лимит или баланс" };
  }
  if (!response.ok) return { ok: false, error: `Сервис снятия знака ответил ошибкой ${response.status}` };

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: "Сервис снятия знака прислал непонятный ответ" };
  }
  const base64 = editedImage(body);
  if (!base64) return { ok: false, error: "Сервис снятия знака не вернул картинку" };
  const data = new Uint8Array(Buffer.from(base64.replace(/^data:[^,]+,/, ""), "base64"));
  if (!detectImageType(data)) return { ok: false, error: "Сервис снятия знака вернул не картинку" };
  return { ok: true, data };
}

/** `edited_image.image` — base64 результата (формат ответа из документации сервиса). */
function editedImage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const edited = (body as { edited_image?: unknown }).edited_image;
  if (typeof edited !== "object" || edited === null) return null;
  const image = (edited as { image?: unknown }).image;
  return typeof image === "string" && image.length > 0 ? image : null;
}
