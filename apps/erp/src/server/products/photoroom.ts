import "server-only";
import { detectImageType, MAX_IMAGE_BYTES } from "@buscom/domain/product/images";
import { readSettings } from "@/server/settings/service";

/**
 * Удаление фона со снимка через платный API Photoroom (Remove Background) — для импорта
 * товара с сайта поставщика. Предмет вырезается, фон становится прозрачным (PNG).
 * Результат смотрит человек — в форме импорта можно вернуть оригинал.
 * Любая неудача — понятный текст, а не исключение.
 *
 * Ключ задаёт администратор в «Администрирование → Внешние сервисы».
 */
const ENDPOINT = "https://sdk.photoroom.com/v1/segment";
const TIMEOUT_MS = 60_000;

export type PhotoroomResult = { ok: true; data: Uint8Array<ArrayBuffer> } | { ok: false; error: string };

/** Ключ из настроек ERP; null — удаление фона выключено. */
export async function getPhotoroomKey(): Promise<string | null> {
  const { services } = await readSettings();
  return services.photoroomApiKey || null;
}

export async function removeBackground(
  image: Uint8Array<ArrayBuffer>,
  fileName: string,
  key: string,
): Promise<PhotoroomResult> {
  const form = new FormData();
  form.append("image_file", new Blob([image], { type: detectImageType(image) ?? "image/jpeg" }), fileName);
  form.append("format", "png");
  form.append("size", "hd");

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": key, accept: "image/png" },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "не ответил вовремя" : "нет связи";
    return { ok: false, error: `Photoroom ${reason}` };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: "Photoroom не принял ключ — проверьте его в «Администрирование → Внешние сервисы»" };
  }
  if (response.status === 402 || response.status === 429) {
    return { ok: false, error: "У Photoroom кончился лимит или баланс" };
  }
  if (!response.ok) return { ok: false, error: `Photoroom ответил ошибкой ${response.status}` };

  const data = new Uint8Array(await response.arrayBuffer());
  if (!detectImageType(data)) return { ok: false, error: "Photoroom вернул не картинку" };
  if (data.byteLength > MAX_IMAGE_BYTES) return { ok: false, error: "Снимок без фона больше 5 МБ" };
  return { ok: true, data };
}
