/**
 * Разбор письма «Вы получили заказ», которое сайт bus-com.ru (OpenCart) шлёт на
 * ящик заказов. Результат — тот же контракт v1, что принимает эндпоинт
 * (`contract.ts`): дальше заказ идёт общим путём — сопоставление клиента,
 * товара по артикулу, пересчёт сумм на сервере.
 *
 * Данные берём из HTML-версии: там таблицы с полями, а в текстовой нет ни
 * клиента, ни доставки. Из текстовой — только комментарий к заказу: в HTML он
 * приклеен к инструкции по оплате без разделителя.
 *
 * Шаблон письма — стандартный `order_alert` OpenCart. Поменяется шаблон на
 * сайте — упадут тесты рядом, а письмо ляжет в журнал интеграции с ошибкой.
 */
import { checkInn } from "@/domain/customer/company-lookup";
import { parseSiteOrder, type SiteOrderPayload } from "@/domain/integration/contract";

export type SiteEmail = {
  subject: string;
  html: string;
  text: string;
  /** Заголовок Date письма в ISO — точнее «Дата добавления» из тела, где только день */
  date: string | null;
};

export type SiteEmailOrder = {
  order: SiteOrderPayload;
  /** Способ оплаты с сайта: в заказе для него поля нет — пишем в журнал заказа */
  paymentMethod: string | null;
};

export type SiteEmailParseResult = { ok: true; value: SiteEmailOrder } | { ok: false; error: string };

/** Письмо о заказе, а не что-то ещё, попавшее в ящик: тема «… - Заказ 2819» и шапка OpenCart. */
export function isSiteOrderEmail(email: Pick<SiteEmail, "subject" | "html" | "text">): boolean {
  return /Заказ\s+\d+\s*$/.test(email.subject.trim()) && /Вы получили заказ/.test(email.html || email.text);
}

/** Номер заказа на сайте — ключ идемпотентности. Тема надёжнее тела: она короче и стабильнее. */
export function siteEmailOrderNumber(email: Pick<SiteEmail, "subject" | "html" | "text">): string | null {
  const fromSubject = email.subject.match(/Заказ\s+(\d+)\s*$/);
  if (fromSubject) return fromSubject[1]!;
  const fromBody = htmlToText(email.html || email.text).match(/№ заказа:\s*(\d+)/);
  return fromBody ? fromBody[1]! : null;
}

export function parseSiteEmail(email: SiteEmail): SiteEmailParseResult {
  const externalId = siteEmailOrderNumber(email);
  if (!externalId) return { ok: false, error: "В письме не найден номер заказа" };

  const tables = parseTables(email.html);
  if (tables.length === 0) return { ok: false, error: "В письме нет HTML-версии с таблицами заказа" };

  const info = labeledValues(findTable(tables, "Информация о заказе")?.flat() ?? []);
  const itemsTable = findTable(tables, "Модель");
  if (!itemsTable) return { ok: false, error: "В письме не найдена таблица товаров" };

  const { items, totals } = readItems(itemsTable);
  const addresses = readAddresses(findTable(tables, "Адрес"));
  const comment = readComment(email.text);
  const company = readCompany(comment);
  const delivery = readDelivery(info.get("Способ доставки") ?? null);

  const name = addresses.payment.name ?? addresses.shipping.name ?? info.get("Электронная почта") ?? "Клиент с сайта";

  // Строки итогов, кроме «Подитог» и «Итого», — доставка (OpenCart подписывает её
  // названием способа доставки). Скидки и купоны приходят отрицательными — их не
  // прибавляем: расхождение с «Итого» ERP запишет в журнал заказа сама.
  const deliveryPriceKopecks = totals
    .filter((row) => !/^(Подитог|Итого)$/i.test(row.label) && row.kopecks > 0)
    .reduce((sum, row) => sum + row.kopecks, 0);
  const total = totals.find((row) => /^Итого$/i.test(row.label));

  const payload = {
    externalId,
    createdAt: email.date ?? undefined,
    customer: {
      type: company ? "COMPANY" : "PERSON",
      name,
      phone: info.get("Телефон") ?? null,
      email: info.get("Электронная почта") ?? null,
      inn: company?.inn ?? null,
      kpp: company?.kpp ?? null,
      companyName: company?.name ?? null,
    },
    items,
    delivery: {
      method: delivery.method,
      carrier: delivery.carrier,
      address: addresses.shipping.address ?? addresses.payment.address,
      priceKopecks: deliveryPriceKopecks,
    },
    totalKopecks: total?.kopecks,
    comment,
  };

  const parsed = parseSiteOrder(payload);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  return { ok: true, value: { order: parsed.order, paymentMethod: info.get("Способ оплаты") ?? null } };
}

// ---------------------------------------------------------------------------
// Разбор HTML. Шаблон фиксированный и простой, поэтому без HTML-парсера:
// таблица → строки → ячейки, переводы строк там, где в разметке <br>.

type Table = string[][];

const ENTITIES: Record<string, string> = {
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
  apos: "'",
  laquo: "«",
  raquo: "»",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/** Текст ячейки: <br> — перевод строки, прочие теги выкидываем, пробелы схлопываем. */
function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function parseTables(html: string): Table[] {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map(([table]) =>
    [...table.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map(([row]) =>
      [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => htmlToText(cell ?? "")),
    ),
  );
}

/** Таблица, в шапке (первой строке) которой есть ячейка, начинающаяся с `header`. */
function findTable(tables: Table[], header: string): Table | undefined {
  return tables.find((table) => table[0]?.some((cell) => cell.startsWith(header)));
}

/** Строки «Метка: значение» из ячеек в словарь. */
function labeledValues(cells: string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of cells.flatMap((cell) => cell.split("\n"))) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match && match[2]) values.set(match[1]!.trim(), match[2].trim());
  }
  return values;
}

/** «27 000 руб.», «7 500,50 руб.», «-500 руб.» → копейки. */
export function parseRubles(value: string): number | null {
  const match = value.replace(/\s/g, "").match(/(-?\d+)(?:[.,](\d{1,2}))?/);
  if (!match) return null;
  const rubles = Number(match[1]);
  const kopecks = Number((match[2] ?? "0").padEnd(2, "0"));
  return rubles * 100 + (rubles < 0 ? -kopecks : kopecks);
}

type TotalRow = { label: string; kopecks: number };

function readItems(table: Table): { items: SiteOrderPayload["items"]; totals: TotalRow[] } {
  const items: SiteOrderPayload["items"] = [];
  const totals: TotalRow[] = [];

  for (const row of table.slice(1)) {
    if (row.length >= 5) {
      // Товар | Модель | Количество | Цена | Всего. Под названием OpenCart пишет
      // выбранные опции строками «- Цвет: чёрный» — переносим их в название позиции.
      const [nameLines = "", model = "", quantity = "", price = ""] = row;
      const [name = "", ...options] = nameLines.split("\n");
      const optionText = options.map((line) => line.replace(/^-\s*/, "").trim()).filter(Boolean);
      items.push({
        sku: model.trim() || null,
        name: optionText.length ? `${name.trim()} (${optionText.join("; ")})` : name.trim(),
        quantity: Number(quantity.replace(/\s/g, "")),
        priceKopecks: parseRubles(price) ?? -1,
      });
    } else if (row.length === 2) {
      const kopecks = parseRubles(row[1] ?? "");
      if (kopecks !== null) totals.push({ label: (row[0] ?? "").replace(/:\s*$/, "").trim(), kopecks });
    }
  }

  return { items, totals };
}

type Address = { name: string | null; address: string | null };

const COUNTRY = /^(Russian Federation|Российская Федерация|Россия)$/i;

/**
 * Блок адреса OpenCart: имя, компания, адрес, город, регион, страна — по строке.
 * Первая строка — имя, страну опускаем, остальное — адрес через запятую.
 */
function readAddresses(table: Table | undefined): { payment: Address; shipping: Address } {
  const empty: Address = { name: null, address: null };
  if (!table || table.length < 2) return { payment: empty, shipping: empty };

  const read = (header: string): Address => {
    const column = table[0]!.findIndex((cell) => cell.startsWith(header));
    const lines = column === -1 ? [] : (table[1]![column] ?? "").split("\n").filter((line) => !COUNTRY.test(line));
    if (lines.length === 0) return empty;
    return { name: lines[0] ?? null, address: lines.slice(1).join(", ") || null };
  };

  return { payment: read("Адрес оплаты"), shipping: read("Адрес доставки") };
}

/** Комментарий покупателя — хвост текстовой версии после «Комментарий к заказу:». */
function readComment(text: string): string | null {
  const index = text.indexOf("Комментарий к заказу:");
  if (index === -1) return null;
  const comment = text
    .slice(index + "Комментарий к заказу:".length)
    .replace(/\r/g, "")
    .replace(/[ \t]+$/gm, "")
    .trim();
  return comment || null;
}

const LEGAL_FORMS: [RegExp, string][] = [
  [/ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ/i, "ООО"],
  [/ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ/i, "ИП"],
  [/ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО/i, "ПАО"],
  [/НЕПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО/i, "АО"],
  [/ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО/i, "ЗАО"],
  [/ОТКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО/i, "ОАО"],
  [/АКЦИОНЕРНОЕ ОБЩЕСТВО/i, "АО"],
];

/**
 * Юрлицо из комментария. Отдельных полей для реквизитов в форме сайта нет —
 * покупатели вставляют карточку предприятия в комментарий. ИНН (10 или 12 цифр
 * с верной контрольной суммой) — признак юрлица: по нему ищется клиент
 * (`src/server/customers/match.ts`). Название — то, что до ИНН после
 * «Реквизиты:»; КПП — чтобы выбрать филиал. Полные реквизиты остаются в
 * комментарии заказа, менеджер переносит их в карточку клиента.
 */
export function readCompany(comment: string | null): { inn: string; kpp: string | null; name: string | null } | null {
  if (!comment) return null;
  const inn = comment.match(/ИНН\D{0,10}?(\d{12}|\d{10})(?!\d)/i);
  if (!inn || !checkInn(inn[1]!).ok) return null;
  // «КПП 770001001» или совмещённое «ИНН/КПП 7700000009 / 770001001»
  const kpp =
    comment.match(/ИНН\s*\/\s*КПП\D{0,10}?\d{10}\D{1,5}(\d{9})(?!\d)/i) ?? comment.match(/КПП\D{0,10}?(\d{9})(?!\d)/i);

  const head = comment
    .slice(0, inn.index)
    .replace(/^[\s\S]*?Реквизиты\s*:?/i, "")
    .replace(/\s+/g, " ")
    .replace(/[\s,;/]+$/, "")
    .trim();
  let name = head || null;
  if (name) for (const [full, short] of LEGAL_FORMS) name = name.replace(full, short);

  return { inn: inn[1]!, kpp: kpp ? kpp[1]! : null, name };
}

/** «ТК "СДЭК"» → перевозка через СДЭК; «Самовывоз» → самовывоз. Прочее — название как есть. */
export function readDelivery(label: string | null): {
  method: "PICKUP" | "CARRIER" | "COURIER" | null;
  carrier: string | null;
} {
  if (!label) return { method: null, carrier: null };
  if (/самовывоз/i.test(label)) return { method: "PICKUP", carrier: null };
  if (/курьер/i.test(label)) return { method: "COURIER", carrier: null };

  const carrier = label
    .replace(/^ТК\s+/i, "")
    .replace(/^["«»“”]+|["«»“”]+$/g, "")
    .trim();
  return { method: "CARRIER", carrier: carrier || null };
}
