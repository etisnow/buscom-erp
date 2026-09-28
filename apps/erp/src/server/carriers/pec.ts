import "server-only";

/**
 * API личного кабинета ПЭК (kabinet.pecom.ru/api/v1). Запросы — POST с JSON,
 * Basic-авторизация: логин кабинета и ключ API. Лимит — 100 запросов в минуту.
 */

const API = "https://kabinet.pecom.ru/api/v1";

export type PecCredentials = { login: string; apiKey: string };

/** Текст ошибки ПЭК: `{ error: { title, message } }` */
function describeError(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const error = (body as { error: unknown }).error;
  if (!error || typeof error !== "object") return String(error);
  const { title, message } = error as { title?: unknown; message?: unknown };
  return [title, message].filter((part) => typeof part === "string" && part).join(". ") || JSON.stringify(error);
}

async function call(credentials: PecCredentials, path: string, body: unknown, timeoutMs: number): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      Authorization: `Basic ${Buffer.from(`${credentials.login}:${credentials.apiKey}`).toString("base64")}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json: unknown = await response.json().catch(() => null);
  if (response.status === 401 || response.status === 403) {
    throw new Error(`ПЭК не принимают логин или ключ: ${describeError(json) ?? response.status}`);
  }
  if (!response.ok || describeError(json)) {
    throw new Error(`ПЭК ответили ${response.status}: ${describeError(json) ?? "без описания"}`);
  }
  return json;
}

/**
 * Проверка логина и ключа тем же запросом, что и обновление справочника (другого
 * дешёвого метода у ПЭК нет): ответ несколько мегабайт, но и проверяют ключ редко.
 */
export async function checkPecCredentials(
  credentials: PecCredentials,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await downloadPecBranches(credentials);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "неизвестная ошибка" };
  }
}

/** Все филиалы с отделениями и складами как есть. Разбор — `@buscom/domain/carrier/pec`. */
export function downloadPecBranches(credentials: PecCredentials): Promise<unknown> {
  return call(credentials, "/branches/all/", {}, 60_000);
}
