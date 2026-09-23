/**
 * Цена товара со страницы каталога vanproject.ru (поставщик «Фургон Проект»).
 *
 * Сайт на MODX с miniShop2 и плагином msOptionsPrice: цена карточки лежит в
 * `<span class="msoptionsprice-cost msoptionsprice-<id>">330</span>`. Разбор по
 * вёрстке, как и у Авито: сменят шаблон — перестанет находить, и это обычный
 * результат `null`, а не исключение.
 *
 * У части товаров цена зависит от вариантов — выпадающие списки
 * `<select name="options[category]">` в форме товара, причём значения второго
 * списка могут зависеть от первого (`data-relations`). Цена на самой странице
 * тогда — цена первого варианта, брать её нельзя: цену выбранного варианта сайт
 * отдаёт запросом `modification/get` к `action.php` плагина, как браузер при смене
 * списка. Несуществующее сочетание сайт не отвергает, а отвечает базовой ценой
 * с `modification.id = 0` — такую цену тоже не берём.
 *
 * Функции чистые: сеть — в `src/server/products/supplier-price.ts`.
 */
import type { Kopecks } from "@/domain/money";
import { priceTextToKopecks, urlHasHost } from "@/domain/product/price-page";

/**
 * Класс `msoptionsprice-cost` целиком: старая цена при скидке идёт в
 * `msoptionsprice-old_cost`, и её брать нельзя.
 */
const COST_PATTERN = /class=["'](?:[^"']*\s)?msoptionsprice-cost(?:\s[^"']*)?["'][^>]*>\s*([^<]+?)\s*</i;

/** Цена со страницы товара. Не нашли или значение бессмысленное — `null`. */
export function parseVanprojectPrice(html: string): Kopecks | null {
  const match = COST_PATTERN.exec(html);
  return match ? priceTextToKopecks(match[1]) : null;
}

export function isVanprojectUrl(value: string): boolean {
  return urlHasHost(value, "vanproject.ru");
}

/** Адрес, куда страница товара отправляет запрос цены варианта. */
export const VANPROJECT_ACTION_URL = "https://vanproject.ru/assets/components/msoptionsprice/action.php";

export type VariantValue = {
  value: string;
  /** Значение доступно, только если в других списках выбрано это: `{ category: "заднее" }` */
  requires: Record<string, string>;
};

export type VariantOption = {
  /** Ключ из `name="options[<key>]"` */
  key: string;
  /** Подпись списка на странице: «Расположение» */
  label: string;
  values: VariantValue[];
};

/** Выбранные варианты: ключ списка → значение. */
export type VariantSelection = Record<string, string>;

export type VanprojectForm = {
  /** id товара на сайте — `<input name="id">` в форме */
  productId: string;
  options: VariantOption[];
};

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? "") : null;
}

/**
 * `data-relations` у варианта: на сайте оно кривое — `[category=сдвижной двери"]"`,
 * поэтому не JSON, а пары `ключ=значение` до кавычки, запятой или скобки.
 */
function parseRelations(raw: string | null): Record<string, string> {
  const requires: Record<string, string> = {};
  if (!raw) return requires;
  for (const match of raw.matchAll(/([\w-]+)\s*=\s*([^"\],]+)/g)) {
    requires[match[1]!] = match[2]!.trim();
  }
  return requires;
}

/**
 * Форма товара со списками вариантов. Нет формы плагина или id товара — `null`.
 * Товар без вариантов — `options` пустой: цену тогда берём со страницы как раньше.
 */
export function parseVanprojectForm(html: string): VanprojectForm | null {
  const formStart = html.search(/<form[^>]*msoptionsprice-product/i);
  if (formStart === -1) return null;
  const formEnd = html.indexOf("</form>", formStart);
  const form = html.slice(formStart, formEnd === -1 ? undefined : formEnd);

  const idTag = /<input[^>]*\sname=["']id["'][^>]*>/i.exec(form)?.[0];
  const productId = idTag ? attribute(idTag, "value") : null;
  if (!productId || !/^\d+$/.test(productId)) return null;

  const options: VariantOption[] = [];
  for (const select of form.matchAll(/<select([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = attribute(select[1]!, "name");
    const key = name?.match(/^options\[([^\]]+)\]$/)?.[1];
    if (!key) continue;

    // Подпись — ближайший «<span class="prop">Расположение:</span>» перед списком
    const before = form.slice(0, select.index);
    const labels = [...before.matchAll(/<span[^>]*class=["'][^"']*\bprop\b[^"']*["'][^>]*>([^<]*)<\/span>/gi)];
    const label = decodeEntities(labels.at(-1)?.[1] ?? key)
      .replace(/:\s*$/, "")
      .trim();

    const values: VariantValue[] = [];
    for (const option of select[2]!.matchAll(/<option([^>]*)>([\s\S]*?)<\/option>/gi)) {
      const value = attribute(option[1]!, "value") ?? decodeEntities(option[2]!).trim();
      if (!value) continue;
      values.push({ value, requires: parseRelations(attribute(option[1]!, "data-relations")) });
    }
    if (values.length > 0) options.push({ key, label, values });
  }

  return { productId, options };
}

/** Значения списка, которые подходят к уже выбранному в других списках. Повторы схлопываются. */
export function availableValues(option: VariantOption, selection: VariantSelection): string[] {
  const fit = option.values.filter((candidate) =>
    Object.entries(candidate.requires).every(
      ([key, value]) => selection[key] === undefined || selection[key] === value,
    ),
  );
  return [...new Set(fit.map((candidate) => candidate.value))];
}

/**
 * Выбор годится для запроса цены: по значению в каждом списке, и каждое значение
 * существует и сочетается с остальными. Иначе — текст, чего не хватает.
 */
export function checkSelection(
  options: VariantOption[],
  selection: VariantSelection,
): { ok: true } | { ok: false; error: string } {
  for (const option of options) {
    const value = selection[option.key];
    if (!value) return { ok: false, error: `Выберите «${option.label}»` };
    if (!availableValues(option, selection).includes(value)) {
      return { ok: false, error: `«${value}» в списке «${option.label}» не подходит к остальному выбору` };
    }
  }
  return { ok: true };
}

/** Поля запроса `modification/get` — как их отправляет форма товара на сайте. */
export function modificationRequestFields(productId: string, selection: VariantSelection): [string, string][] {
  return [
    ["id", productId],
    ["count", "1"],
    ...Object.entries(selection).map(([key, value]): [string, string] => [`options[${key}]`, value]),
    ["action", "modification/get"],
    ["ctx", "web"],
  ];
}

/**
 * Цена из ответа `modification/get`. Модификация не найдена (`id` 0 — сайт
 * подставил базовую цену) или ответ не тот — `null`.
 */
export function parseModificationPrice(json: unknown): Kopecks | null {
  if (typeof json !== "object" || json === null) return null;
  const response = json as { success?: unknown; data?: { modification?: { id?: unknown; price?: unknown } } };
  if (response.success !== true) return null;
  const modification = response.data?.modification;
  if (!modification || !(Number(modification.id) > 0)) return null;
  return priceTextToKopecks(String(modification.price ?? ""));
}

/** «Расположение: заднее; Комплектация: 1845х780мм глухое прозрачное» — для подсказки у ссылки. */
export function describeSelection(options: VariantOption[], selection: VariantSelection): string {
  return options
    .filter((option) => selection[option.key])
    .map((option) => `${option.label}: ${selection[option.key]}`)
    .join("; ");
}
