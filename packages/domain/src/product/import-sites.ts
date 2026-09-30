import { urlHasHost } from "./price-page";

/**
 * Сайты поставщиков, с которых умеет импортировать товар «Импорт с сайта поставщика»
 * (`apps/erp/src/server/products/supplier-import.ts`). Список здесь, а не на сервере,
 * чтобы окно импорта показывало подсказки и узнавало сайт по набранной ссылке.
 * Новый сайт: парсер в этой папке, строка сюда и строка в `SOURCES` импорта.
 */
export type ImportSite = {
  name: string;
  host: string;
  /** Что с этого сайта приходит — короткая подсказка в окне импорта */
  note: string;
};

export const IMPORT_SITES: readonly ImportSite[] = [
  { name: "Фургон Проект", host: "vanproject.ru", note: "описание, варианты с закупкой" },
  { name: "ЕвроСид", host: "evrosid.ru", note: "описание, если есть" },
  { name: "Нижбаскомплект", host: "buskomplektnn.ru", note: "описание и характеристики" },
  { name: "Техпрестиж", host: "tehprestige.ru", note: "без описания, только артикул" },
  { name: "Группа деталей", host: "gruppa-detaley.ru", note: "без описания, только артикул" },
];

/** Сайт поставщика по ссылке; `null` — такой сайт не поддерживается (или это не ссылка). */
export function detectImportSite(value: string): ImportSite | null {
  const text = value.trim();
  if (!text) return null;
  // Ссылку часто вставляют без «https://» — догадываемся за человека
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  return IMPORT_SITES.find((site) => urlHasHost(url, site.host)) ?? null;
}

/** Хоть что-то, похожее на ссылку: нужна точка в имени сайта. */
export function looksLikeLink(value: string): boolean {
  const text = value.trim();
  if (!text || /\s/.test(text)) return false;
  return /^(?:[a-z][a-z0-9+.-]*:\/\/)?[^/\s]+\.[^/\s]{2,}/i.test(text);
}
