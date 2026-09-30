import "server-only";
import type { CargoStatusResult } from "@buscom/domain/carrier/cargo-status";
import type { KitDirectory } from "@buscom/domain/carrier/kit";
import { parseKitCargoStatus } from "@buscom/domain/carrier/kit-status";

/**
 * API «КИТ» (capi.tk-kit.com): метод — путь вида `/1.0/order/status/get`, запрос
 * POST с JSON, токен — в заголовке `Authorization: Bearer`.
 */

const API = "https://capi.tk-kit.com";

/** Ошибки КИТ приходят с 4xx и текстом в `message` или `error` */
function describeError(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const { message, error } = body as { message?: unknown; error?: unknown };
  const text = [message, error].find((part) => typeof part === "string" && part);
  return typeof text === "string" ? text : null;
}

async function requestStatus(token: string, cargoNumber: string): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(`${API}/1.0/order/status/get`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cargo_number: cargoNumber }),
    signal: AbortSignal.timeout(15_000),
  });
  return { response, body: await response.json().catch(() => null) };
}

const REJECTED = "КИТ не принимают токен — проверьте, что он скопирован целиком";

/** Статус груза по номеру накладной. Ничего не сохраняет. */
export async function fetchKitCargoStatus(token: string, cargoNumber: string): Promise<CargoStatusResult> {
  const { response, body } = await requestStatus(token, cargoNumber);
  if (response.status === 401 || response.status === 403) return { ok: false, error: REJECTED };
  if (response.ok) return parseKitCargoStatus(body);
  return { ok: false, error: `КИТ ответили ${response.status}: ${describeError(body) ?? "груз не найден"}` };
}

/**
 * Проверка токена: запрос статуса несуществующего груза. Отказ по авторизации —
 * токен негодный; любой другой ответ (в том числе «груз не найден») — токен принят.
 */
export async function checkKitToken(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { response } = await requestStatus(token, "000000000000");
  if (response.status === 401 || response.status === 403) return { ok: false, error: REJECTED };
  if (response.status >= 500) return { ok: false, error: `КИТ ответили ${response.status} — попробуйте позже` };
  return { ok: true };
}

/** Метод справочника: список записей или ошибка с понятным текстом */
async function callList(token: string, path: string, body: object): Promise<unknown[]> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json: unknown = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) throw new Error(REJECTED);
  if (!response.ok || !Array.isArray(json)) {
    throw new Error(`КИТ ответили ${response.status} на ${path}: ${describeError(json) ?? "не список"}`);
  }
  return json;
}

/** Города, связка с географией и адреса терминалов как есть. Разбор — `@buscom/domain/carrier/kit`. */
export async function downloadKitDirectory(token: string): Promise<KitDirectory> {
  const cities = await callList(token, "/1.1/tdd/city/get-list", {});
  const geographyCities = await callList(token, "/1.0/geography/city/get-list", {});
  const addresses = await callList(token, "/1.1/geography/address/get-list", { withPhone: 1 });
  return { cities, geographyCities, addresses };
}
