/**
 * Работа с параметрами URL, общая для списков заказов, клиентов и товаров.
 *
 * Состояние списков живёт в адресной строке (PRD: ссылку на отфильтрованный
 * список можно переслать), а выгрузка в CSV читает те же параметры, что и
 * страница, — поэтому разбор один на всех, а не свой у каждого экрана.
 */

export type RawParams = Record<string, string | string[] | undefined>;

export function list(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

export function single(value: string | string[] | undefined): string | undefined {
  const [first] = list(value);
  return first;
}

/** Номер страницы: мусор и отрицательные значения — это первая страница. */
export function pageNumber(value: string | string[] | undefined): number {
  const page = Number(single(value) ?? "1");
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** Те же параметры обратно в строку — для ссылок вкладок, пагинации и выгрузки. */
export function toSearchParams(params: RawParams): URLSearchParams {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    for (const item of list(value)) result.append(key, item);
  }
  return result;
}
