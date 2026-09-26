/**
 * Настройки системы и их значения по умолчанию (docs/PRD.md, «Бизнес-правила»).
 * Умолчания заданы здесь, в БД лежит только то, что администратор поменял, —
 * поэтому пустая база сразу работоспособна.
 */
import { z } from "zod";
import { DEFAULT_EMAIL_TEMPLATES, parseEmailTemplates, type EmailTemplates } from "@/domain/email/templates";
import { DEFAULT_DISCOUNT_LIMIT_PERCENT } from "@/domain/order/discount";
import { DEFAULT_SLA_MINUTES } from "@/domain/sla";
import type { OrderStatus } from "@buscom/db/enums";

export const SETTING_KEYS = {
  discountLimitPercent: "discountLimitPercent",
  slaMinutes: "slaMinutes",
  sellerRequisites: "sellerRequisites",
  smtp: "smtp",
  emailTemplates: "emailTemplates",
  imap: "imap",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const discountLimitSchema = z
  .number()
  .min(0, { error: "Лимит скидки не может быть отрицательным" })
  .max(100, { error: "Лимит скидки не может превышать 100%" });

const statusKeys = ["NEW", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

/**
 * SLA в рабочих минутах; null — срок не контролируется.
 * `partialRecord`, а не `record`: администратор может настроить часть статусов,
 * остальные берутся из умолчаний (обычный record с enum-ключом требует все ключи).
 */
export const slaMinutesSchema = z.partialRecord(z.enum(statusKeys), z.number().int().positive().nullable());

/** Реквизиты продавца для счёта. Состав полей уточняется у заказчика (PRD). */
export const sellerRequisitesSchema = z.object({
  name: z.string().default(""),
  inn: z.string().default(""),
  kpp: z.string().default(""),
  address: z.string().default(""),
  bankName: z.string().default(""),
  bankAccount: z.string().default(""),
  correspondentAccount: z.string().default(""),
  bic: z.string().default(""),
  signerName: z.string().default(""),
  phone: z.string().default(""),
});

export type SellerRequisites = z.infer<typeof sellerRequisitesSchema>;

export const DEFAULT_SELLER_REQUISITES: SellerRequisites = {
  name: "",
  inn: "",
  kpp: "",
  address: "",
  bankName: "",
  bankAccount: "",
  correspondentAccount: "",
  bic: "",
  signerName: "",
  phone: "",
};

/**
 * Почтовый сервер для писем со сбросом пароля. Заполняется администратором в
 * `/admin/dictionaries`; пока не заполнен, берутся переменные окружения
 * (`src/server/mail.ts`) — так боевой контур, настроенный через `.env.production`,
 * продолжает работать, а разработке почтовый сервер по-прежнему не нужен.
 */
export const smtpSettingsSchema = z.object({
  host: z.string().trim().default(""),
  port: z.coerce
    .number({ error: "Порт — число" })
    .int({ error: "Порт — целое число" })
    .min(1, { error: "Порт вне диапазона" })
    .max(65535, { error: "Порт вне диапазона" })
    .default(587),
  /** true — TLS сразу (обычно порт 465), false — STARTTLS уже в сессии (587) */
  secure: z.boolean().default(false),
  user: z.string().trim().default(""),
  password: z.string().default(""),
  /** Поле «От кого». Пустое — подставится значение из переменных окружения */
  from: z.string().trim().default(""),
});

export type SmtpSettings = z.infer<typeof smtpSettingsSchema>;

export const DEFAULT_SMTP_SETTINGS: SmtpSettings = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  password: "",
  from: "",
};

/** Настроен ли почтовый сервер: решает один хост, как и в переменных окружения. */
export function smtpConfigured(settings: SmtpSettings): boolean {
  return settings.host.length > 0;
}

/**
 * Слияние сохранённых настроек с пришедшими из формы. Пустой пароль означает
 * «оставить прежний»: в браузер сохранённый пароль не отдаётся, поэтому форма
 * приходит с пустым полем, и без этого правила любое сохранение его стирало бы.
 * Стереть пароль осознанно можно, убрав хост, — тогда почта и так выключается.
 */
export function mergeSmtpSettings(current: SmtpSettings, incoming: SmtpSettings): SmtpSettings {
  return { ...incoming, password: incoming.password === "" ? current.password : incoming.password };
}

/**
 * Общий ящик, из которого приходят заказы с сайта и письма клиентов
 * (`src/server/integrations/mailbox.ts`). IMAP по SSL. Пока не заполнен целиком,
 * берутся переменные окружения `IMAP_*` — как у SMTP, введённое в интерфейсе главнее.
 */
export const imapSettingsSchema = z.object({
  host: z.string().trim().default(""),
  port: z.coerce
    .number({ error: "Порт — число" })
    .int({ error: "Порт — целое число" })
    .min(1, { error: "Порт вне диапазона" })
    .max(65535, { error: "Порт вне диапазона" })
    .default(993),
  user: z.string().trim().default(""),
  password: z.string().default(""),
});

export type ImapSettings = z.infer<typeof imapSettingsSchema>;

export const DEFAULT_IMAP_SETTINGS: ImapSettings = { host: "", port: 993, user: "", password: "" };

/** Ящик можно открыть, только когда есть и сервер, и логин, и пароль. */
export function imapConfigured(settings: ImapSettings): boolean {
  return Boolean(settings.host && settings.user && settings.password);
}

/** Пустой пароль из формы — «оставить прежний», как у SMTP (`mergeSmtpSettings`). */
export function mergeImapSettings(current: ImapSettings, incoming: ImapSettings): ImapSettings {
  return { ...incoming, password: incoming.password === "" ? current.password : incoming.password };
}

export type AppSettings = {
  discountLimitPercent: number;
  slaMinutes: Record<OrderStatus, number | null>;
  sellerRequisites: SellerRequisites;
  smtp: SmtpSettings;
  emailTemplates: EmailTemplates;
  imap: ImapSettings;
};

export const DEFAULT_SETTINGS: AppSettings = {
  discountLimitPercent: DEFAULT_DISCOUNT_LIMIT_PERCENT,
  slaMinutes: DEFAULT_SLA_MINUTES,
  sellerRequisites: DEFAULT_SELLER_REQUISITES,
  smtp: DEFAULT_SMTP_SETTINGS,
  emailTemplates: DEFAULT_EMAIL_TEMPLATES,
  imap: DEFAULT_IMAP_SETTINGS,
};

/** Разбор значения из БД: негодное значение не роняет систему, а откатывается к умолчанию. */
export function parseSetting<K extends keyof AppSettings>(key: K, raw: unknown): AppSettings[K] {
  switch (key) {
    case "discountLimitPercent": {
      const parsed = discountLimitSchema.safeParse(raw);
      return (parsed.success ? parsed.data : DEFAULT_SETTINGS.discountLimitPercent) as AppSettings[K];
    }
    case "slaMinutes": {
      const parsed = slaMinutesSchema.safeParse(raw);
      if (!parsed.success) return DEFAULT_SETTINGS.slaMinutes as AppSettings[K];
      // Пропущенные статусы добираем из умолчаний — частичная настройка допустима.
      return { ...DEFAULT_SLA_MINUTES, ...parsed.data } as AppSettings[K];
    }
    case "sellerRequisites": {
      const parsed = sellerRequisitesSchema.safeParse(raw);
      return (parsed.success ? parsed.data : DEFAULT_SELLER_REQUISITES) as AppSettings[K];
    }
    case "smtp": {
      const parsed = smtpSettingsSchema.safeParse(raw);
      return (parsed.success ? parsed.data : DEFAULT_SMTP_SETTINGS) as AppSettings[K];
    }
    case "emailTemplates":
      return parseEmailTemplates(raw) as AppSettings[K];
    case "imap": {
      const parsed = imapSettingsSchema.safeParse(raw);
      return (parsed.success ? parsed.data : DEFAULT_IMAP_SETTINGS) as AppSettings[K];
    }
    default:
      return DEFAULT_SETTINGS[key];
  }
}

/** Реквизиты заполнены настолько, что счёт печатать осмысленно. */
export function requisitesReady(requisites: SellerRequisites): boolean {
  return Boolean(requisites.name.trim() && requisites.inn.trim() && requisites.bankAccount.trim());
}
