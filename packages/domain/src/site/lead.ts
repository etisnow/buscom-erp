import { z } from "zod";
import { normalizePhone } from "../customer/phone";

/**
 * Заявки с сайта (docs/SITE-PRD.md, экраны 01 и 07): «Заказать обратный звонок» на
 * «Контактах» и «Обновляете салон целиком» на главной. Решение владельца 27.09:
 * заявка уходит письмом на почту компании — её отправляет ERP, у неё настроена почта.
 */

export const LEAD_KINDS = ["callback", "salon"] as const;
export type LeadKind = (typeof LEAD_KINDS)[number];

const LEAD_TITLES: Record<LeadKind, string> = {
  callback: "Обратный звонок",
  salon: "Салон целиком",
};

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const leadSchema = z
  .object({
    /** Повторная отправка той же формы не даёт второго письма */
    requestId: z.uuid(),
    kind: z.enum(LEAD_KINDS),
    name: z.string().trim().max(120).min(2, { error: "Укажите имя" }),
    phone: z.string().max(40),
    /** Модель авто и задача — у заявки «салон целиком» */
    model: text(120),
    task: text(2000),
    consent: z.boolean(),
    /** Скрытое поле-ловушка для ботов */
    website: z.string().max(0, { error: "Ошибка формы — обновите страницу" }).optional(),
  })
  .superRefine((value, ctx) => {
    if (!normalizePhone(value.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Укажите телефон в формате +7 XXX XXX-XX-XX" });
    }
    if (!value.consent) {
      ctx.addIssue({ code: "custom", path: ["consent"], message: "Нужно согласие на обработку персональных данных" });
    }
  })
  .transform(({ website: _website, consent: _consent, ...value }) => ({
    ...value,
    phone: normalizePhone(value.phone) as string,
  }));

export type Lead = z.infer<typeof leadSchema>;

/** «+79123456789» → «+7 912 345-67-89»: в письме номер читают глазами и набирают. */
function displayPhone(phone: string): string {
  const digits = phone.slice(2);
  return `+7 ${digits.slice(0, 3)} ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

/** Письмо о заявке менеджерам. Телефон — в теме: заявку видно в списке писем, не открывая. */
export function leadLetter(lead: Lead, page: string): { subject: string; text: string } {
  const phone = displayPhone(lead.phone);
  const lines = [
    `${LEAD_TITLES[lead.kind]} — заявка с сайта bus-com.ru`,
    "",
    `Имя: ${lead.name}`,
    `Телефон: ${phone}`,
    ...(lead.model ? [`Модель авто: ${lead.model}`] : []),
    ...(lead.task ? ["", "Задача:", lead.task] : []),
    "",
    `Страница: ${page}`,
    "Покупатель ждёт звонка в рабочее время.",
  ];
  return { subject: `Заявка с сайта: ${LEAD_TITLES[lead.kind].toLowerCase()}, ${phone}`, text: lines.join("\n") };
}
