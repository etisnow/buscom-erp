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
