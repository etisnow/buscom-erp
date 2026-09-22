import "server-only";
import type { Kopecks } from "@/domain/money";
import { isAvitoUrl, parseAvitoPrice } from "@/domain/product/avito";
import { isVanprojectUrl, parseVanprojectPrice } from "@/domain/product/vanproject";

/**
 * Цена товара со страницы поставщика — для кнопки «Подтянуть цену» в карточке
 * товара. Разбор разметки живёт в `src/domain/product/*`, здесь только выбор
 * сайта по ссылке и поход в сеть.
 *
 * Чего ждать: сайты не любят автоматические запросы (Авито отвечает то 403, то
 * страницей с проверкой). Поэтому любой неуспех — понятный текст для менеджера,
 * а не исключение: цену всегда можно вписать руками, кнопка лишь экономит время.
 */

/** Страница товара весит сотни килобайт; больше — читать незачем. */
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 20_000;

/** Сайты, с которых умеем брать цену. Новый — парсер в domain + строка здесь. */
const SOURCES: {
  name: string;
  host: string;
  matches: (url: string) => boolean;
  parse: (html: string) => Kopecks | null;
}[] = [
  { name: "Авито", host: "avito.ru", matches: isAvitoUrl, parse: parseAvitoPrice },
  { name: "Фургон Проект", host: "vanproject.ru", matches: isVanprojectUrl, parse: parseVanprojectPrice },
];

export type SupplierPriceResult = { ok: true; priceKopecks: Kopecks } | { ok: false; error: string };

export async function fetchSupplierPrice(url: string): Promise<SupplierPriceResult> {
  const source = SOURCES.find((candidate) => candidate.matches(url));
  if (!source) {
    const hosts = SOURCES.map((candidate) => candidate.host).join(", ");
    return { ok: false, error: `Пока умею подтягивать цену только с ${hosts}` };
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
      // Страница товара живая, кеш Next тут только мешал бы
      cache: "no-store",
    });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError" ? `${source.name} не ответил вовремя` : "нет связи";
    return { ok: false, error: `Не удалось открыть страницу: ${reason}` };
  }

  if (response.status === 403 || response.status === 429) {
    return { ok: false, error: `${source.name} не пустил запрос из системы — скопируйте цену со страницы руками` };
  }
  if (response.status === 404) {
    return { ok: false, error: "Страница товара не найдена: возможно, его сняли" };
  }
  if (!response.ok) {
    return { ok: false, error: `${source.name} ответил ошибкой ${response.status}` };
  }

  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) {
    return { ok: false, error: "Страница слишком большая" };
  }

  const html = (await response.text()).slice(0, MAX_BYTES);
  const priceKopecks = source.parse(html);
  if (priceKopecks === null) {
    return { ok: false, error: "Цену на странице найти не удалось — впишите её руками" };
  }

  return { ok: true, priceKopecks };
}
