/**
 * Настройки системы и их значения по умолчанию (docs/PRD.md, «Бизнес-правила»).
 * Умолчания заданы здесь, в БД лежит только то, что администратор поменял, —
 * поэтому пустая база сразу работоспособна.
 */
import { z } from "zod";
import { DEFAULT_DISCOUNT_LIMIT_PERCENT } from "@/domain/order/discount";
import { DEFAULT_SLA_MINUTES } from "@/domain/sla";
import type { OrderStatus } from "@/generated/prisma/enums";

export const SETTING_KEYS = {
  discountLimitPercent: "discountLimitPercent",
  slaMinutes: "slaMinutes",
  sellerRequisites: "sellerRequisites",
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

export type AppSettings = {
  discountLimitPercent: number;
  slaMinutes: Record<OrderStatus, number | null>;
  sellerRequisites: SellerRequisites;
};

export const DEFAULT_SETTINGS: AppSettings = {
  discountLimitPercent: DEFAULT_DISCOUNT_LIMIT_PERCENT,
  slaMinutes: DEFAULT_SLA_MINUTES,
  sellerRequisites: DEFAULT_SELLER_REQUISITES,
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
    default:
      return DEFAULT_SETTINGS[key];
  }
}

/** Реквизиты заполнены настолько, что счёт печатать осмысленно. */
export function requisitesReady(requisites: SellerRequisites): boolean {
  return Boolean(requisites.name.trim() && requisites.inn.trim() && requisites.bankAccount.trim());
}
