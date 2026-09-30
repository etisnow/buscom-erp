/**
 * Пуш-уведомления на телефоны и компьютеры сотрудников (Web Push): что приходит
 * от браузера при подписке и что уходит в уведомление.
 */
import { z } from "zod";

/**
 * Сервисы пушей браузеров: Chrome и прочие на Chromium (в том числе Яндекс, Samsung,
 * Opera) — Google, Safari — Apple, Firefox — Mozilla, Edge — Microsoft.
 */
const PUSH_SERVICE_HOSTS = [".googleapis.com", ".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];

export function isPushServiceHost(host: string): boolean {
  const dotted = `.${host.toLowerCase()}`;
  return PUSH_SERVICE_HOSTS.some((suffix) => dotted.endsWith(suffix));
}

/**
 * Подписка из `PushSubscription.toJSON()` браузера. Адрес — только https и только
 * сервиса пушей: сервер шлёт на него запросы, и произвольный адрес с клиента
 * превратил бы ERP в инструмент для запросов куда угодно, в том числе внутрь сети.
 */
export const pushSubscriptionSchema = z.object({
  endpoint: z
    .url({ protocol: /^https$/, error: "Адрес подписки должен быть https" })
    .max(1000)
    .refine((url) => isPushServiceHost(new URL(url).hostname), { error: "Неизвестный сервис пушей" }),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** Что получает service worker (`/sw.js`) и показывает уведомлением. */
export type PushPayload = {
  title: string;
  body: string;
  /** Куда перейти по нажатию */
  url: string;
  /** Уведомления с одним тегом заменяют друг друга, а не копятся стопкой */
  tag: string;
};

/** Сервисы пушей принимают до 4 КБ, а в шторке всё равно видно две-три строки. */
export const MAX_PUSH_BODY = 200;

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function filesLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} файл`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} файла`;
  return `${count} файлов`;
}

export function chatPushPayload(message: { authorName: string; text: string; attachmentCount: number }): PushPayload {
  const files = message.attachmentCount ? `📎 ${filesLabel(message.attachmentCount)}` : "";
  const text = truncate(message.text, MAX_PUSH_BODY);
  return {
    title: `Чат · ${message.authorName}`,
    body: [text, files].filter(Boolean).join("\n") || "Новое сообщение",
    url: "/chat",
    tag: "chat",
  };
}

/**
 * Пуш по уведомлению о заказе (те же темы, что у писем: новый заказ, статус оплаты, этап поставщика).
 * Заголовок — тема письма без «BusCom ERP: », текст — строки письма без ссылки, нажатие открывает заказ.
 * Тег — id уведомления: каждое показывается отдельно, а не заменяет предыдущее (в чате тег общий).
 */
export function notificationPushPayload(input: {
  id: string;
  subject: string;
  text: string;
  orderNumber: number | null;
}): PushPayload {
  const title = truncate(input.subject.replace(/^BusCom ERP:\s*/, ""), 80) || "Уведомление";
  const lines = input.text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^https?:\/\//i.test(line));
  const body = lines.join("\n");
  return {
    title,
    body: body.length > MAX_PUSH_BODY ? `${body.slice(0, MAX_PUSH_BODY - 1)}…` : body,
    url: input.orderNumber !== null ? `/orders/${input.orderNumber}` : "/",
    tag: input.id,
  };
}
