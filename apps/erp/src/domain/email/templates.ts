/**
 * Шаблоны писем клиенту (PRD, M6.2): «Счёт на оплату», «Заказ оплачен»,
 * «Заказ отправлен». Текст правит администратор в справочниках, в БД лежит
 * только изменённое — умолчания здесь, как у остальных настроек.
 *
 * Подстановки — слова в фигурных скобках: `{номер}`, `{сумма}`… Неизвестная
 * подстановка остаётся в тексте как есть: опечатку в шаблоне видно в письме
 * перед отправкой, а не молча теряется кусок текста.
 */
import { z } from "zod";
import { formatMoscowDate } from "@/domain/datetime";
import { formatRub, type Kopecks } from "@/domain/money";
import { remainingToPay } from "@/domain/order/payment-status";

export const EMAIL_TEMPLATE_KEYS = ["invoice", "paid", "shipped"] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_LABELS: Record<EmailTemplateKey, string> = {
  invoice: "Счёт на оплату",
  paid: "Заказ оплачен",
  shipped: "Заказ отправлен",
};

const templateSchema = z.object({
  subject: z.string().trim().min(1, { error: "Тема письма не может быть пустой" }).max(300),
  body: z.string().trim().min(1, { error: "Текст письма не может быть пустым" }).max(20_000),
});

export type EmailTemplate = z.infer<typeof templateSchema>;
export type EmailTemplates = Record<EmailTemplateKey, EmailTemplate>;

export const emailTemplatesSchema = z.object({
  invoice: templateSchema,
  paid: templateSchema,
  shipped: templateSchema,
});

const SIGNATURE = "\n\nС уважением,\n{продавец}\n{телефон}";

export const DEFAULT_EMAIL_TEMPLATES: EmailTemplates = {
  invoice: {
    subject: "Счёт на оплату заказа №{номер}",
    body: `Здравствуйте, {клиент}!\n\nВо вложении счёт на оплату заказа №{номер} на сумму {сумма}.${SIGNATURE}`,
  },
  paid: {
    subject: "Ваш заказ №{номер} оплачен",
    body: `Здравствуйте, {клиент}!\n\nОплата заказа №{номер} на сумму {оплачено} получена, спасибо. Заказ передан в работу — сообщим, когда отправим его.${SIGNATURE}`,
  },
  shipped: {
    subject: "Ваш заказ №{номер} отправлен",
    body: `Здравствуйте, {клиент}!\n\nЗаказ №{номер} отправлен {дата_отгрузки}.\nТранспортная компания: {тк}\nТрек-номер: {трек}\nАдрес доставки: {адрес}${SIGNATURE}`,
  },
};

/** Подстановки с пояснениями — для подсказки в редакторе шаблонов. */
export const TEMPLATE_PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "номер", description: "номер заказа для клиента: на сайте, если заказ с сайта, иначе в ERP" },
  { key: "номер_в_erp", description: "номер заказа в ERP" },
  { key: "клиент", description: "имя или название клиента" },
  { key: "сумма", description: "итог заказа" },
  { key: "оплачено", description: "сколько оплачено" },
  { key: "остаток", description: "остаток к оплате" },
  { key: "тк", description: "транспортная компания" },
  { key: "трек", description: "трек-номер" },
  { key: "адрес", description: "адрес или терминал доставки" },
  { key: "дата_отгрузки", description: "дата отгрузки (или сегодня)" },
  { key: "продавец", description: "название продавца из реквизитов" },
  { key: "телефон", description: "телефон продавца из реквизитов" },
];

export type TemplateOrder = {
  number: number;
  /** Номер на сайте — у заказа с сайта; клиент знает заказ по нему */
  siteNumber: string | null;
  customerName: string;
  totalKopecks: Kopecks;
  paidKopecks: Kopecks;
  carrier: string | null;
  trackingNumber: string | null;
  deliveryAddress: string | null;
  shippedAt: Date | null;
};

/** Номер заказа, который знает клиент: на сайте, если заказ оттуда, иначе номер в ERP. */
export function clientOrderNumber(order: { number: number; siteNumber: string | null }): string {
  return order.siteNumber?.trim() || String(order.number);
}

export type TemplateSeller = { name: string; phone: string };

export function templateVariables(
  order: TemplateOrder,
  seller: TemplateSeller,
  now = new Date(),
): Record<string, string> {
  return {
    номер: clientOrderNumber(order),
    номер_в_erp: String(order.number),
    клиент: order.customerName,
    сумма: formatRub(order.totalKopecks),
    оплачено: formatRub(order.paidKopecks),
    остаток: formatRub(remainingToPay(order.totalKopecks, order.paidKopecks)),
    тк: order.carrier ?? "",
    трек: order.trackingNumber ?? "",
    адрес: order.deliveryAddress ?? "",
    дата_отгрузки: formatMoscowDate(order.shippedAt ?? now),
    продавец: seller.name,
    телефон: seller.phone,
  };
}

/**
 * Подстановка значений. Строка, в которой все подстановки оказались пустыми
 * («Трек-номер: »), выбрасывается целиком — клиенту незачем видеть пустые поля.
 */
export function renderTemplate(text: string, variables: Record<string, string>): string {
  const lines = text.split("\n").flatMap((line) => {
    let used = 0;
    let filled = 0;
    const rendered = line.replace(/\{([\p{L}_]+)\}/gu, (match, key: string) => {
      if (!(key in variables)) return match;
      used++;
      const value = variables[key].trim();
      if (value) filled++;
      return value;
    });
    return used > 0 && filled === 0 ? [] : [rendered.trimEnd()];
  });
  return lines.join("\n").trim();
}

export function renderEmailTemplate(template: EmailTemplate, variables: Record<string, string>): EmailTemplate {
  return { subject: renderTemplate(template.subject, variables), body: renderTemplate(template.body, variables) };
}

/** Негодное значение из БД не роняет почту — откатываемся к умолчаниям по каждому шаблону. */
export function parseEmailTemplates(raw: unknown): EmailTemplates {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const result = { ...DEFAULT_EMAIL_TEMPLATES };
  for (const key of EMAIL_TEMPLATE_KEYS) {
    const parsed = templateSchema.safeParse(source[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result;
}
