import "server-only";
import type { Kopecks } from "@/domain/money";
import { isAvitoUrl, parseAvitoPrice } from "@/domain/product/avito";

/**
 * Цена товара со страницы объявления на avito.ru — для кнопки «Подтянуть цену»
 * в карточке товара. Разбор разметки живёт в `src/domain/product/avito.ts`,
 * здесь только поход в сеть.
 *
 * Чего ждать: Авито не любит автоматические запросы и отвечает то 403, то
 * страницей с проверкой. Поэтому любой неуспех — понятный текст для менеджера,
 * а не исключение: цену всегда можно вписать руками, кнопка лишь экономит время.
 */

/** Страница объявления весит сотни килобайт; больше — читать незачем. */
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 20_000;

export type AvitoPriceResult = { ok: true; priceKopecks: Kopecks } | { ok: false; error: string };

export async function fetchAvitoPrice(url: string): Promise<AvitoPriceResult> {
  if (!isAvitoUrl(url)) {
    return { ok: false, error: "Пока умею подтягивать цену только с avito.ru" };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Без обычных заголовков браузера Авито отдаёт заглушку вместо объявления
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "ru-RU,ru;q=0.9",
      },
      // Страница объявления живая, кеш Next тут только мешал бы
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "Авито не ответил вовремя" : "нет связи";
    return { ok: false, error: `Не удалось открыть страницу: ${reason}` };
  }

  if (response.status === 403 || response.status === 429) {
    return { ok: false, error: "Авито не пустил запрос из системы — скопируйте цену со страницы руками" };
  }
  if (response.status === 404) {
    return { ok: false, error: "Объявление не найдено: возможно, его сняли" };
  }
  if (!response.ok) {
    return { ok: false, error: `Авито ответил ошибкой ${response.status}` };
  }

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return { ok: false, error: "Страница слишком большая" };
  }

  const html = (await response.text()).slice(0, MAX_BYTES);
  const priceKopecks = parseAvitoPrice(html);
  if (priceKopecks === null) {
    return { ok: false, error: "Цену на странице найти не удалось — впишите её руками" };
  }

  return { ok: true, priceKopecks };
}
