/**
 * Ссылки в тексте сообщения. Адреса «https://…», «http://…» и «www.…» становятся внешними
 * ссылками; «№3021», «№ 3021» и «#3021» — ссылкой на карточку заказа. Ссылкой на заказ делается
 * только номер существующего заказа — это решает сервер, здесь только разбор текста.
 * Адрес разбирается первым: «#3021» внутри него — часть адреса, а не номер заказа.
 */

export type MessageSegment =
  | { type: "text"; text: string }
  | { type: "order"; text: string; number: number }
  /** `href` — готовый адрес: только http/https, у «www.…» дописан https:// */
  | { type: "link"; text: string; href: string };

const URL_LIKE = /(?<![\p{L}\p{N}_])(?:https?:\/\/|www\.)[^\s<>"«»]+/giu;
/** Знаки, которыми предложение продолжается после адреса: «см. https://a.ru/b.» — точка не его часть. */
const TRAILING_PUNCT = /[.,;:!?'"»…\]]$/u;

/** Отрезает от найденного хвост, который скорее знак препинания, чем часть адреса. */
function trimUrl(raw: string): string {
  let url = raw;
  for (;;) {
    if (TRAILING_PUNCT.test(url)) {
      url = url.slice(0, -1);
    } else if (url.endsWith(")") && url.split(")").length > url.split("(").length) {
      // «(см. https://a.ru/b)» — скобка закрывает предложение; «https://a.ru/x_(y)» — часть адреса
      url = url.slice(0, -1);
    } else {
      return url;
    }
  }
}

/** Есть ли после схемы что-то похожее на адрес: «https://» или «www.» сами по себе — не ссылка. */
function isUsableUrl(url: string): boolean {
  return /^(?:https?:\/\/|www\.)[\p{L}\p{N}]/iu.test(url);
}

/** Знак перед номером не должен быть частью слова: «abc#12» — не ссылка. */
const ORDER_REF = /(?<![\p{L}\p{N}_])(?:№\s?|#)(\d{1,9})(?!\d)/gu;

export function splitOrderLinks(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_LIKE)) {
    const url = trimUrl(match[0]);
    if (!isUsableUrl(url)) continue;
    if (match.index > last) segments.push(...splitOrders(text.slice(last, match.index)));
    segments.push({ type: "link", text: url, href: /^www\./i.test(url) ? `https://${url}` : url });
    last = match.index + url.length;
  }
  if (last < text.length) segments.push(...splitOrders(text.slice(last)));
  return segments;
}

function splitOrders(text: string): MessageSegment[] {
  const segments: MessageSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(ORDER_REF)) {
    const start = match.index;
    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    segments.push({ type: "order", text: match[0], number: Number(match[1]) });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

/** Номера заказов, упомянутые в тексте, без повторов. */
export function orderNumbersIn(text: string): number[] {
  const numbers = new Set<number>();
  for (const segment of splitOrderLinks(text)) if (segment.type === "order") numbers.add(segment.number);
  return [...numbers];
}
