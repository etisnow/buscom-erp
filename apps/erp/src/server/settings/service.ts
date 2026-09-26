import "server-only";
import { cache } from "react";
import type { EmailTemplates } from "@/domain/email/templates";
import { CANCEL_REASONS } from "@/domain/order/cancel-reasons";
import {
  DEFAULT_SETTINGS,
  parseSetting,
  SETTING_KEYS,
  type AppSettings,
  type ImapSettings,
  type SellerRequisites,
  type SmtpSettings,
} from "@/domain/settings";
import type { Prisma } from "@buscom/db/client";
import type { DictionaryType, OrderSource, OrderStatus } from "@buscom/db/enums";
import { db } from "@/server/db";

/**
 * Настройки системы. В БД лежит только изменённое, остальное — умолчания из домена,
 * поэтому пустая база работоспособна. `cache` — один запрос на HTTP-запрос.
 */
export async function readSettings(): Promise<AppSettings> {
  const rows = await db.setting.findMany();
  const stored = new Map(rows.map((row) => [row.key, row.value]));

  return {
    discountLimitPercent: stored.has(SETTING_KEYS.discountLimitPercent)
      ? parseSetting("discountLimitPercent", stored.get(SETTING_KEYS.discountLimitPercent))
      : DEFAULT_SETTINGS.discountLimitPercent,
    slaMinutes: stored.has(SETTING_KEYS.slaMinutes)
      ? parseSetting("slaMinutes", stored.get(SETTING_KEYS.slaMinutes))
      : DEFAULT_SETTINGS.slaMinutes,
    sellerRequisites: stored.has(SETTING_KEYS.sellerRequisites)
      ? parseSetting("sellerRequisites", stored.get(SETTING_KEYS.sellerRequisites))
      : DEFAULT_SETTINGS.sellerRequisites,
    smtp: stored.has(SETTING_KEYS.smtp) ? parseSetting("smtp", stored.get(SETTING_KEYS.smtp)) : DEFAULT_SETTINGS.smtp,
    emailTemplates: stored.has(SETTING_KEYS.emailTemplates)
      ? parseSetting("emailTemplates", stored.get(SETTING_KEYS.emailTemplates))
      : DEFAULT_SETTINGS.emailTemplates,
    imap: stored.has(SETTING_KEYS.imap) ? parseSetting("imap", stored.get(SETTING_KEYS.imap)) : DEFAULT_SETTINGS.imap,
  };
}

/**
 * Те же настройки, но один запрос на HTTP-запрос. `cache` требует контекста
 * рендера, поэтому вне его (отправка письма из Better Auth, скрипты) берут
 * `readSettings` напрямую.
 */
export const getSettings = cache(readSettings);

async function writeSetting(key: string, value: Prisma.InputJsonValue, userId: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    create: { key, value, updatedBy: userId },
    update: { value, updatedBy: userId },
  });
}

export async function saveDiscountLimit(percent: number, userId: string): Promise<void> {
  await writeSetting(SETTING_KEYS.discountLimitPercent, percent, userId);
}

export async function saveSlaMinutes(
  minutes: Partial<Record<OrderStatus, number | null>>,
  userId: string,
): Promise<void> {
  await writeSetting(SETTING_KEYS.slaMinutes, minutes as Prisma.InputJsonValue, userId);
}

export async function saveImapSettings(settings: ImapSettings, userId: string): Promise<void> {
  await writeSetting(SETTING_KEYS.imap, settings, userId);
}

export async function saveEmailTemplates(templates: EmailTemplates, userId: string): Promise<void> {
  await writeSetting(SETTING_KEYS.emailTemplates, templates, userId);
}

export async function saveSellerRequisites(requisites: SellerRequisites, userId: string): Promise<void> {
  await writeSetting(SETTING_KEYS.sellerRequisites, requisites, userId);
}

export type DictionaryEntry = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** Системный источник заказа (SITE, LEGACY): переименовать можно, выключить нельзя */
  systemCode: OrderSource | null;
};

/** Почтовый сервер. Пароль хранится как есть — без него отправка невозможна. */
export async function saveSmtpSettings(settings: SmtpSettings, userId: string): Promise<void> {
  await writeSetting(SETTING_KEYS.smtp, settings, userId);
}

export async function listDictionary(type: DictionaryType, onlyActive = false): Promise<DictionaryEntry[]> {
  return db.dictionaryItem.findMany({
    where: { type, ...(onlyActive ? { isActive: true } : {}) },
    select: { id: true, name: true, sortOrder: true, isActive: true, systemCode: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function addDictionaryItem(type: DictionaryType, name: string): Promise<void> {
  const value = name.trim();
  if (!value) throw new Error("Название не может быть пустым");

  const last = await db.dictionaryItem.findFirst({
    where: { type },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  await db.dictionaryItem.create({
    data: { type, name: value, sortOrder: (last?.sortOrder ?? 0) + 10 },
  });
}

/**
 * Выключенная позиция перестаёт предлагаться в новых формах, но остаётся у
 * заказов, где уже стоит. Для источника это единственный путь убрать его из
 * форм, если он есть в заказах, — удалить такой нельзя.
 */
export async function setDictionaryItemActive(id: string, isActive: boolean): Promise<void> {
  const item = await db.dictionaryItem.findUniqueOrThrow({ where: { id }, select: { systemCode: true } });
  // Без системного пункта интеграции и импорту некуда было бы относить заказы.
  if (item.systemCode && !isActive) throw new Error("Системный источник выключить нельзя — его ставит сама система");
  await db.dictionaryItem.update({ where: { id }, data: { isActive } });
}

/**
 * Удаление позиции справочника. Причины отмены и ТК заказ хранит текстом —
 * их удаление старые заказы не задевает. Источник заказ хранит ссылкой, поэтому
 * источник, который уже стоит в заказах (включая удалённые), удалить нельзя —
 * только выключить. Системные источники не удаляются вовсе.
 */
export async function deleteDictionaryItem(id: string): Promise<void> {
  const item = await db.dictionaryItem.findUniqueOrThrow({
    where: { id },
    select: { type: true, name: true, systemCode: true, _count: { select: { orders: true } } },
  });
  if (item.systemCode) throw new Error("Системный источник удалить нельзя — его ставит сама система");
  if (item._count.orders > 0) {
    throw new Error(`Источник стоит в заказах (${item._count.orders}) — удалить нельзя, его можно выключить`);
  }
  // Модель товар хранит названием: удалённая осталась бы у товаров «ничьей».
  if (item.type === "CAR_MODEL") {
    const products = await db.product.count({ where: { compatibility: { has: item.name } } });
    if (products > 0) {
      throw new Error(`Модель указана у товаров (${products}) — удалить нельзя, её можно выключить`);
    }
  }

  await db.dictionaryItem.delete({ where: { id } });
}

/**
 * Переименование. Модель авто товар хранит названием, поэтому она переименовывается
 * и у товаров — в той же транзакции, иначе товары остались бы со старым названием.
 * ТК и причины отмены заказ хранит текстом как снимок: старые заказы не трогаем.
 */
export async function renameDictionaryItem(id: string, name: string): Promise<void> {
  const value = name.trim();
  if (!value) throw new Error("Название не может быть пустым");

  await db.$transaction(async (tx) => {
    const item = await tx.dictionaryItem.findUniqueOrThrow({ where: { id }, select: { type: true, name: true } });
    await tx.dictionaryItem.update({ where: { id }, data: { name: value } });
    if (item.type === "CAR_MODEL" && item.name !== value) {
      await tx.$executeRaw`
        UPDATE "Product"
        SET "compatibility" = array_replace("compatibility", ${item.name}, ${value}), "updatedAt" = now()
        WHERE ${item.name} = ANY("compatibility")`;
    }
  });
}

/**
 * Причины отмены для диалога и для проверки на сервере. Пока администратор
 * не завёл свой список, работает набор по умолчанию из домена — иначе отменить
 * заказ было бы нечем.
 */
export async function getCancelReasons(): Promise<string[]> {
  const items = await listDictionary("CANCEL_REASON", true);
  return items.length > 0 ? items.map((item) => item.name) : [...CANCEL_REASONS];
}

/**
 * Модели авто для выбора совместимости в карточке товара — включённые, в порядке
 * справочника. Выключенная модель пропадает из выбора, но остаётся у товаров.
 */
export async function getCarModels(): Promise<string[]> {
  const items = await listDictionary("CAR_MODEL", true);
  return items.map((item) => item.name);
}

/** Транспортные компании для подсказки в блоке доставки. */
export async function getCarriers(): Promise<string[]> {
  const items = await listDictionary("CARRIER", true);
  return items.map((item) => item.name);
}

export type OrderSourceOption = { id: string; name: string };

/**
 * Источники, которые менеджер выбирает сам: включённые и не системные —
 * «Сайт» и «Прежнюю ERP» ставят интеграция и импорт.
 */
export async function getOrderSources(): Promise<OrderSourceOption[]> {
  const items = await listDictionary("ORDER_SOURCE", true);
  return items.filter((item) => item.systemCode === null).map((item) => ({ id: item.id, name: item.name }));
}
