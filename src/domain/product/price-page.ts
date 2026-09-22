/**
 * Общее для разбора цены со страниц поставщиков (`avito.ts`, `vanproject.ts`):
 * проверка, что ссылка ведёт на нужный сайт, и перевод текста цены в копейки.
 */
import type { Kopecks } from "@/domain/money";

/** Цена за одну запчасть выше этого — точно ошибка разбора, а не цена. */
const MAX_REASONABLE_RUBLES = 100_000_000;

/** «1 234 567», «1234.00», «1 234,00» → 1234567 копеек и т.д. Бессмыслица — `null`. */
export function priceTextToKopecks(raw: string): Kopecks | null {
  // Пробелы внутри числа — разделители разрядов, в том числе неразрывные
  const cleaned = raw.replace(/[\s  ]/g, "").replace(",", ".");
  if (cleaned === "") return null;

  const rubles = Number(cleaned);
  if (!Number.isFinite(rubles) || rubles <= 0 || rubles > MAX_REASONABLE_RUBLES) return null;

  return Math.round(rubles * 100);
}

/**
 * Ссылка ведёт на `domain` или его поддомен? Проверяется именно хост, а не
 * вхождение строки: `avito.ru.zloy.site` не должен сойти за Авито.
 */
export function urlHasHost(value: string, domain: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const host = url.hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}
