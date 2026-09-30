import "server-only";
import { z } from "zod";
import type { CargoStatusResult } from "@buscom/domain/carrier/cargo-status";
import { parseDellinStatusHistory } from "@buscom/domain/carrier/dellin-status";

/**
 * API «Деловых Линий» (dev.dellin.ru). Запросы — POST с JSON, ключ приложения
 * `appkey` в теле. Лимит у ДЛ — 45 запросов в минуту на приложение.
 */

const API = "https://api.dellin.ru";

/** Ошибка ДЛ текстом: `errors` приходит то строкой, то списком, то объектом. */
function describeErrors(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("errors" in body)) return null;
  const errors = (body as { errors: unknown }).errors;
  if (typeof errors === "string") return errors;
  return JSON.stringify(errors);
}

/** Ответ на запрос справочника: ссылка на файл (живёт ограниченное время) и хеш его содержимого */
const fileLinkSchema = z.object({ url: z.url(), hash: z.string() });

type LinkResult = { ok: true; url: string } | { ok: false; error: string };

async function requestTerminalsLink(appkey: string): Promise<LinkResult> {
  const response = await fetch(`${API}/v3/public/terminals.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appkey }),
    signal: AbortSignal.timeout(10_000),
  });
  const body: unknown = await response.json().catch(() => null);
  const link = fileLinkSchema.safeParse(body);
  if (response.ok && link.success) return { ok: true, url: link.data.url };
  if (response.status === 401) {
    return { ok: false, error: "ДЛ не принимают ключ — проверьте, что он скопирован целиком" };
  }
  return { ok: false, error: `ДЛ ответили ${response.status}: ${describeErrors(body) ?? "без ссылки на справочник"}` };
}

/**
 * Проверка ключа: запрос ссылки на справочник терминалов — самый дешёвый метод,
 * которому нужен только `appkey`. Ничего не сохраняет.
 */
export async function checkDellinAppKey(appkey: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const link = await requestTerminalsLink(appkey);
  return link.ok ? { ok: true } : link;
}

/** Статус груза по номеру накладной (`/v3/orders/statuses_history.json`). Ничего не сохраняет. */
export async function fetchDellinCargoStatus(appkey: string, docId: string): Promise<CargoStatusResult> {
  const response = await fetch(`${API}/v3/orders/statuses_history.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appkey, docIds: [docId] }),
    signal: AbortSignal.timeout(15_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.status === 401) {
    return { ok: false, error: "ДЛ не принимают ключ — проверьте его в «Администрирование → Транспортные компании»" };
  }
  if (response.ok) {
    const result = parseDellinStatusHistory(body, docId);
    if (result.ok || !describeErrors(body)) return result;
  }
  return { ok: false, error: `ДЛ ответили ${response.status}: ${describeErrors(body) ?? "без подробностей"}` };
}

/** Файл справочника терминалов как есть (около 1,5 МБ JSON). Разбор — `@buscom/domain/carrier/dellin`. */
export async function downloadDellinTerminals(appkey: string): Promise<unknown> {
  const link = await requestTerminalsLink(appkey);
  if (!link.ok) throw new Error(link.error);
  const response = await fetch(link.url, { signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Справочник ДЛ не скачался: ${response.status}`);
  return response.json();
}
