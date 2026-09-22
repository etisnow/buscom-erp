import "server-only";
import { parseDadataParty, type CompanyInfo } from "@/domain/customer/company-lookup";
import { env } from "@/server/env";

/**
 * Данные юрлица или ИП по ИНН из DaData (`findById/party`). Разбор ответа —
 * в `src/domain/customer/company-lookup.ts`, здесь только поход в сеть.
 *
 * Любой неуспех — понятный текст для менеджера, а не исключение: реквизиты
 * всегда можно вписать руками, кнопка лишь экономит время.
 */

const ENDPOINT = "https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/party";
const TIMEOUT_MS = 10_000;

export type CompanyLookupResult = { ok: true; company: CompanyInfo } | { ok: false; error: string };

/** `inn` уже проверен `checkInn`: только цифры, контрольная сумма сошлась. */
export async function findCompanyByInn(inn: string): Promise<CompanyLookupResult> {
  if (!env.DADATA_API_KEY) {
    return { ok: false, error: "Поиск по ИНН не настроен: нужен ключ DaData (DADATA_API_KEY)" };
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        authorization: `Token ${env.DADATA_API_KEY}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      // MAIN — головная организация: у филиалов тот же ИНН, но свой КПП и адрес
      body: JSON.stringify({ query: inn, branch_type: "MAIN" }),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "DaData не ответила вовремя" : "нет связи";
    return { ok: false, error: `Не удалось проверить ИНН: ${reason}` };
  }

  if (response.status === 401 || response.status === 403) {
    return { ok: false, error: "DaData не приняла ключ API — проверьте DADATA_API_KEY" };
  }
  if (response.status === 429) {
    return { ok: false, error: "Исчерпан дневной лимит запросов к DaData — впишите реквизиты руками" };
  }
  if (!response.ok) {
    return { ok: false, error: `DaData ответила ошибкой ${response.status}` };
  }

  const company = parseDadataParty(await response.json().catch(() => null));
  if (!company) {
    return { ok: false, error: "Организация с таким ИНН не найдена" };
  }

  return { ok: true, company };
}
