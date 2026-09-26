/**
 * Ссылки на заказы в тексте сообщения: «№3021», «№ 3021» и «#3021» становятся
 * ссылкой на карточку. Ссылкой делается только номер существующего заказа —
 * это решает сервер, здесь только разбор текста.
 */

export type MessageSegment = { type: "text"; text: string } | { type: "order"; text: string; number: number };

/** Знак перед номером не должен быть частью слова: «abc#12» — не ссылка. */
const ORDER_REF = /(?<![\p{L}\p{N}_])(?:№\s?|#)(\d{1,9})(?!\d)/gu;

export function splitOrderLinks(text: string): MessageSegment[] {
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
