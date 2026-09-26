/**
 * Переписка с клиентом по почте (PRD, M6.2): разбор адресов, привязка входящего
 * письма к заказу и подсказки «Сообщить клиенту?».
 */
import { paymentStatus } from "@/domain/order/payment-status";
import type { EmailTemplateKey } from "./templates";

/** Максимум на одно вложение — как у счетов поставщиков. Крупнее не храним, но отмечаем в письме. */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;

const EMAIL_RE = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** Адрес без имени и в нижнем регистре: «Иван <Ivan@Mail.ru>» → «ivan@mail.ru». Не адрес — null. */
export function normalizeEmailAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const angle = /<([^>]+)>/.exec(value);
  const address = (angle ? angle[1] : value).trim().toLowerCase();
  return EMAIL_RE.test(address) ? address : null;
}

/** Строка адресов через запятую или точку с запятой — в список проверенных; негодные — отдельно. */
export function parseAddressList(value: string): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const part of value.split(/[,;]/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const address = normalizeEmailAddress(trimmed);
    if (address) {
      if (!valid.includes(address)) valid.push(address);
    } else invalid.push(trimmed);
  }
  return { valid, invalid };
}

/**
 * Номер заказа из темы письма: «Re: Ваш заказ №3016 оплачен», «заказ 3016»,
 * «Заказ № 3016». Просто число в теме не считается — слишком легко ошибиться
 * (артикул, год, сумма).
 */
export function orderNumberFromSubject(subject: string): number | null {
  const match = /(?:№\s*|заказ[а-я]*\s+(?:№\s*)?)(\d{1,7})(?!\d)/iu.exec(subject);
  if (!match) return null;
  const number = Number(match[1]);
  return number > 0 ? number : null;
}

/** Message-ID без угловых скобок и пробелов — так их и сравниваем. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  const id = value?.trim().replace(/^<|>$/g, "").trim();
  return id ? id : null;
}

/** Все Message-ID из заголовков References / In-Reply-To. */
export function referencedMessageIds(...headers: (string | string[] | null | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const header of headers) {
    const values = Array.isArray(header) ? header : header ? [header] : [];
    for (const value of values) {
      for (const match of value.matchAll(/<([^>]+)>|(\S+@\S+)/g)) {
        const id = normalizeMessageId(match[1] ?? match[2]);
        if (id) ids.add(id);
      }
    }
  }
  return [...ids];
}

/** Тема ответа: «Re: » один раз, сколько бы ни было «Re:», «RE:», «Fwd:» у исходной. */
export function replySubject(subject: string): string {
  const base = subject.replace(/^(\s*(re|fwd?|ответ)\s*(\[\d+\])?\s*:\s*)+/i, "").trim();
  return base ? `Re: ${base}` : "Re:";
}

export type SuggestionOrder = {
  totalKopecks: number;
  paidKopecks: number;
  trackingNumber: string | null;
  customerEmail: string | null;
};

/**
 * Какие письма предложить отправить: «оплачен» — когда оплата покрыла итог,
 * «отправлен» — когда вписан трек. Письмо, уже отправленное этим шаблоном,
 * повторно не предлагается. Без email клиента подсказок нет.
 */
export function suggestedTemplates(order: SuggestionOrder, sentTemplates: string[]): EmailTemplateKey[] {
  if (!order.customerEmail) return [];
  const result: EmailTemplateKey[] = [];
  const status = paymentStatus(order.totalKopecks, order.paidKopecks);
  if (order.totalKopecks > 0 && (status === "PAID" || status === "OVERPAID") && !sentTemplates.includes("paid")) {
    result.push("paid");
  }
  if (order.trackingNumber?.trim() && !sentTemplates.includes("shipped")) result.push("shipped");
  return result;
}

/** Разделители цитаты в стиле Outlook и почтовых клиентов, которые не ставят «>». */
const QUOTE_SEPARATOR_RE =
  /^\s*(-{2,}\s*(original message|исходное сообщение|пересылаемое сообщение|forwarded message)\s*-{2,}|_{10,})\s*$/i;

/**
 * Текст ответа без цитаты: клиенты отвечают поверх всей переписки, и в ленте её
 * надо свернуть. Цитата — хвост письма, где каждая непустая строка начинается с
 * «>», вместе со строкой-шапкой перед ним («чт, 25 сент. 2026 г. в 00:13, Имя <адрес>:»),
 * либо всё после разделителя Outlook («-----Original Message-----»).
 *
 * Если цитатой оказалось всё письмо, ничего не сворачиваем — иначе на экране
 * была бы пустота.
 */
export function splitQuotedReply(body: string): { main: string; quoted: string | null } {
  const lines = body.replace(/\r\n?/g, "\n").split("\n");

  let start = lines.findIndex((line) => QUOTE_SEPARATOR_RE.test(line));
  if (start === -1) {
    // Хвост из «>»-строк: идём с конца, пустые строки хвост не прерывают
    let i = lines.length - 1;
    while (i >= 0 && (lines[i].trim() === "" || lines[i].trimStart().startsWith(">"))) i--;
    start = lines.slice(i + 1).some((line) => line.trimStart().startsWith(">")) ? i + 1 : -1;
    // Шапка цитаты — одна-две строки, заканчивающиеся двоеточием
    if (start > 0) {
      let j = start - 1;
      while (j >= 0 && lines[j].trim() === "") j--;
      if (j >= 0 && lines[j].trimEnd().endsWith(":")) {
        start = j;
        if (j > 0 && lines[j - 1].trim() !== "" && !lines[j - 1].trimEnd().endsWith(".")) {
          // Шапка, перенесённая на две строки: «25.09.2026 00:13, Басском.\nКомплектующие <info@…>:»
          if (/\d{1,2}[:.]\d{2}|@/.test(lines[j - 1] + lines[j])) start = j - 1;
        }
      }
    }
  }
  if (start <= 0) return { main: body.trim(), quoted: null };

  const main = lines.slice(0, start).join("\n").trim();
  const quoted = lines.slice(start).join("\n").trim();
  return main ? { main, quoted: quoted || null } : { main: body.trim(), quoted: null };
}
