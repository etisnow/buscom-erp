import "server-only";
import { detectImageType, MAX_IMAGE_BYTES } from "@buscom/domain/product/images";
import { readSettings } from "@/server/settings/service";

/**
 * Удаление фона со снимка через платный API carve.photos — для импорта товара с сайта
 * поставщика. Предмет вырезается, фон становится прозрачным (PNG). Результат смотрит
 * человек — в форме импорта можно вернуть оригинал. Любая неудача — понятный текст,
 * а не исключение.
 *
 * API асинхронный: `POST /images/remove_bg` (multipart, поле `image`) отвечает 202 и
 * `image_id`, дальше `GET /images/images/{id}` — 201/202 «ещё считается», 200 с
 * `image_url` — готово (по этой ссылке ключ не нужен). Формат сверен с официальным SDK
 * (github.com/Carve-Photos/sdk-python).
 *
 * Ключ задаёт администратор в «Администрирование → Внешние сервисы».
 */
const BASE_URL = "https://api.carve.photos/api/v1";
const TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_500;

export type CarveResult = { ok: true; data: Uint8Array<ArrayBuffer> } | { ok: false; error: string };

/** Ключ из настроек ERP; null — удаление фона выключено. */
export async function getCarveKey(): Promise<string | null> {
  const { services } = await readSettings();
  return services.carveApiKey || null;
}

/** Ошибка HTTP-статуса ответа carve.photos → текст для человека; null — статус успешный. */
function statusError(status: number): string | null {
  if (status === 401 || status === 403) {
    return "carve.photos не принял ключ — проверьте его в «Администрирование → Внешние сервисы»";
  }
  if (status === 402 || status === 429) return "У carve.photos кончился лимит или баланс";
  return status >= 400 ? `carve.photos ответил ошибкой ${status}` : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function removeBackground(
  image: Uint8Array<ArrayBuffer>,
  fileName: string,
  key: string,
): Promise<CarveResult> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  const headers = { "X-API-Key": key };
  try {
    const form = new FormData();
    form.append("image", new Blob([image], { type: detectImageType(image) ?? "image/jpeg" }), fileName);
    form.append("format", "png");
    form.append("size", "auto");

    const created = await fetch(`${BASE_URL}/images/remove_bg`, {
      method: "POST",
      headers,
      body: form,
      signal,
      cache: "no-store",
    });
    const failure = statusError(created.status);
    if (failure) return { ok: false, error: failure };
    if (created.status !== 202) return { ok: false, error: `carve.photos ответил ошибкой ${created.status}` };
    const { image_id: imageId } = (await created.json()) as { image_id?: string };
    if (!imageId) return { ok: false, error: "carve.photos не вернул номер задачи" };

    let imageUrl: string | null = null;
    while (imageUrl === null) {
      await sleep(POLL_INTERVAL_MS);
      const status = await fetch(`${BASE_URL}/images/images/${encodeURIComponent(imageId)}`, {
        headers,
        signal,
        cache: "no-store",
      });
      if (status.status === 200) {
        imageUrl = ((await status.json()) as { image_url?: string }).image_url ?? "";
        if (!imageUrl) return { ok: false, error: "carve.photos не вернул ссылку на результат" };
      } else if (status.status !== 201 && status.status !== 202) {
        return {
          ok: false,
          error: statusError(status.status) ?? `carve.photos не смог обработать снимок (${status.status})`,
        };
      }
    }

    // Ссылка на результат — с подписью, ключ не нужен и чужому хосту его не отдаём
    const download = await fetch(imageUrl, { signal, cache: "no-store" });
    if (!download.ok) return { ok: false, error: `carve.photos не отдал результат (${download.status})` };
    const data = new Uint8Array(await download.arrayBuffer());
    if (!detectImageType(data)) return { ok: false, error: "carve.photos вернул не картинку" };
    if (data.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "Снимок без фона больше 5 МБ" };
    return { ok: true, data };
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "не ответил вовремя" : "нет связи";
    return { ok: false, error: `carve.photos ${reason}` };
  }
}
