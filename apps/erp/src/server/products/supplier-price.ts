import "server-only";
import type { Kopecks } from "@buscom/domain/money";
import { isAvitoUrl, parseAvitoPrice } from "@buscom/domain/product/avito";
import { comboLabel, enumerateCombos, type SupplierCombo } from "@buscom/domain/product/option-matching";
import {
  checkSelection,
  isVanprojectUrl,
  modificationRequestFields,
  parseModificationPrice,
  parseVanprojectForm,
  parseVanprojectPrice,
  VANPROJECT_ACTION_URL,
  type VariantOption,
  type VariantSelection,
} from "@buscom/domain/product/vanproject";

/**
 * Цена товара со страницы поставщика — для кнопки «Подтянуть цену» в карточке
 * товара. Разбор разметки живёт в `packages/domain/src/product/*`, здесь только выбор
 * сайта по ссылке и поход в сеть.
 *
 * Чего ждать: сайты не любят автоматические запросы (Авито отвечает то 403, то
 * страницей с проверкой). Поэтому любой неуспех — понятный текст для менеджера,
 * а не исключение: цену всегда можно вписать руками, кнопка лишь экономит время.
 */

/** Страница товара весит сотни килобайт; больше — читать незачем. */
const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 20_000;

const BROWSER_HEADERS = {
  // Без обычных заголовков браузера Авито отдаёт заглушку вместо объявления
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "accept-language": "ru-RU,ru;q=0.9",
};

/** Сайты, с которых умеем брать цену. Новый — парсер в domain + строка здесь. */
const SOURCES: {
  name: string;
  host: string;
  matches: (url: string) => boolean;
  parse: (html: string) => Kopecks | null;
  /** Сайт с вариантами товара: цена выбранного варианта — отдельным запросом */
  variants?: boolean;
}[] = [
  { name: "Авито", host: "avito.ru", matches: isAvitoUrl, parse: parseAvitoPrice },
  {
    name: "Фургон Проект",
    host: "vanproject.ru",
    matches: isVanprojectUrl,
    parse: parseVanprojectPrice,
    variants: true,
  },
];

/** Списки вариантов на странице и то, что из них выбрано, — для выбора в карточке товара. */
export type SupplierVariants = { options: VariantOption[]; selection: VariantSelection };

export type SupplierPriceResult =
  | { ok: true; priceKopecks: Kopecks; variants?: SupplierVariants }
  /** `variants` — на странице есть варианты: цену дадим, когда в каждом списке будет выбор */
  | { ok: false; error: string; variants?: SupplierVariants };

type Fetched = { ok: true; response: Response } | { ok: false; error: string };

async function request(url: string, init: RequestInit, sourceName: string): Promise<Fetched> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Страница товара живая, кеш Next тут только мешал бы
      cache: "no-store",
      ...init,
    });
    return { ok: true, response };
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "TimeoutError" ? `${sourceName} не ответил вовремя` : "нет связи";
    return { ok: false, error: `Не удалось открыть страницу: ${reason}` };
  }
}

function statusError(response: Response, sourceName: string): string | null {
  if (response.status === 403 || response.status === 429) {
    return `${sourceName} не пустил запрос из системы — скопируйте цену со страницы руками`;
  }
  if (response.status === 404) return "Страница товара не найдена: возможно, его сняли";
  if (!response.ok) return `${sourceName} ответил ошибкой ${response.status}`;
  return null;
}

/**
 * Цена со страницы поставщика. `selection` — выбранные варианты товара, если
 * цена на сайте от них зависит; без полного выбора такая страница вернёт списки
 * вариантов вместо цены.
 */
export async function fetchSupplierPrice(url: string, selection: VariantSelection = {}): Promise<SupplierPriceResult> {
  const source = SOURCES.find((candidate) => candidate.matches(url));
  if (!source) {
    const hosts = SOURCES.map((candidate) => candidate.host).join(", ");
    return { ok: false, error: `Пока умею подтягивать цену только с ${hosts}` };
  }

  const page = await request(
    url,
    { headers: { ...BROWSER_HEADERS, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } },
    source.name,
  );
  if (!page.ok) return page;
  const pageError = statusError(page.response, source.name);
  if (pageError) return { ok: false, error: pageError };

  const length = Number(page.response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return { ok: false, error: "Страница слишком большая" };
  const html = (await page.response.text()).slice(0, MAX_BYTES);

  const form = source.variants ? parseVanprojectForm(html) : null;
  if (form && form.options.length > 0) {
    // Выбор мог остаться от прошлой версии страницы: берём только известные ключи
    const known = Object.fromEntries(
      Object.entries(selection).filter(([key]) => form.options.some((option) => option.key === key)),
    );
    const variants: SupplierVariants = { options: form.options, selection: known };
    const check = checkSelection(form.options, known);
    if (!check.ok) {
      return { ok: false, error: `У товара на сайте есть варианты. ${check.error} — цена зависит от выбора`, variants };
    }
    return fetchVariantPrice(form.productId, known, url, source.name, variants);
  }

  const priceKopecks = source.parse(html);
  if (priceKopecks === null) {
    return { ok: false, error: "Цену на странице найти не удалось — впишите её руками" };
  }
  return { ok: true, priceKopecks };
}

/** Цена выбранного варианта — тот же запрос, что делает страница при смене списка. */
async function fetchVariantPrice(
  productId: string,
  selection: VariantSelection,
  pageUrl: string,
  sourceName: string,
  variants: SupplierVariants,
): Promise<SupplierPriceResult> {
  const body = new FormData();
  for (const [key, value] of modificationRequestFields(productId, selection)) body.append(key, value);

  const answer = await request(
    VANPROJECT_ACTION_URL,
    {
      method: "POST",
      body,
      headers: {
        ...BROWSER_HEADERS,
        accept: "application/json, text/javascript, */*; q=0.01",
        "x-requested-with": "XMLHttpRequest",
        referer: pageUrl,
      },
    },
    sourceName,
  );
  if (!answer.ok) return { ...answer, variants };
  const answerError = statusError(answer.response, sourceName);
  if (answerError) return { ok: false, error: answerError, variants };

  let json: unknown;
  try {
    json = await answer.response.json();
  } catch {
    return { ok: false, error: `${sourceName} ответил не тем, что ждали, — впишите цену руками`, variants };
  }

  const priceKopecks = parseModificationPrice(json);
  if (priceKopecks === null) {
    return { ok: false, error: "Для такого сочетания вариантов сайт цену не дал — проверьте выбор", variants };
  }
  return { ok: true, priceKopecks, variants };
}

/** Больше сочетаний на одной странице не обходим — это уже не товар, а каталог. */
const MAX_COMBOS = 80;
/** Сколько запросов цены к сайту поставщика одновременно: быстро, но без нагрузки. */
const COMBO_CONCURRENCY = 4;

export type SupplierCombosResult = { ok: true; combos: SupplierCombo[] } | { ok: false; error: string };

/**
 * Все варианты товара на странице поставщика с ценами — для «Подтянуть цены
 * опций». Цену каждого сочетания спрашиваем у сайта так же, как для одного
 * варианта; сочетание, для которого сайт цену не дал, приходит с `null`.
 */
export async function fetchSupplierCombos(url: string): Promise<SupplierCombosResult> {
  const source = SOURCES.find((candidate) => candidate.matches(url));
  if (!source?.variants) {
    return { ok: false, error: "Цены опций пока умею подтягивать только с vanproject.ru" };
  }

  const page = await request(
    url,
    { headers: { ...BROWSER_HEADERS, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" } },
    source.name,
  );
  if (!page.ok) return page;
  const pageError = statusError(page.response, source.name);
  if (pageError) return { ok: false, error: pageError };

  const form = parseVanprojectForm((await page.response.text()).slice(0, MAX_BYTES));
  if (!form || form.options.length === 0) {
    return { ok: false, error: "На странице у товара нет вариантов — цены опций брать неоткуда" };
  }

  const selections = enumerateCombos(form.options);
  if (selections.length > MAX_COMBOS) {
    return { ok: false, error: `На странице ${selections.length} вариантов — слишком много, чтобы обойти все` };
  }

  const combos: SupplierCombo[] = selections.map((selection) => ({
    selection,
    label: comboLabel(form.options, selection),
    priceKopecks: null,
  }));
  let next = 0;
  const worker = async () => {
    while (next < combos.length) {
      const combo = combos[next++]!;
      const variants: SupplierVariants = { options: form.options, selection: combo.selection };
      const result = await fetchVariantPrice(form.productId, combo.selection, url, source.name, variants);
      combo.priceKopecks = result.ok ? result.priceKopecks : null;
    }
  };
  await Promise.all(Array.from({ length: Math.min(COMBO_CONCURRENCY, combos.length) }, worker));

  if (combos.every((combo) => combo.priceKopecks === null)) {
    return { ok: false, error: `${source.name} не дал цен ни для одного варианта — впишите их руками` };
  }
  return { ok: true, combos };
}
