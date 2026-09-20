import "server-only";
import { cache } from "react";
import { CANCEL_REASONS } from "@/domain/order/cancel-reasons";
import {
  DEFAULT_SETTINGS,
  parseSetting,
  SETTING_KEYS,
  type AppSettings,
  type SellerRequisites,
} from "@/domain/settings";
import type { Prisma } from "@/generated/prisma/client";
import type { DictionaryType, OrderStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

/**
 * Настройки системы. В БД лежит только изменённое, остальное — умолчания из домена,
 * поэтому пустая база работоспособна. `cache` — один запрос на HTTP-запрос.
 */
export const getSettings = cache(async (): Promise<AppSettings> => {
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
  };
});

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

export async function saveSellerRequisites(requisites: SellerRequisites, userId: string): Promise<void> {
  await writeSetting(SETTING_KEYS.sellerRequisites, requisites, userId);
}

export type DictionaryEntry = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export async function listDictionary(type: DictionaryType, onlyActive = false): Promise<DictionaryEntry[]> {
  return db.dictionaryItem.findMany({
    where: { type, ...(onlyActive ? { isActive: true } : {}) },
    select: { id: true, name: true, sortOrder: true, isActive: true },
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
 * Позиции справочника не удаляются: на них ссылаются старые заказы текстом.
 * Выключенная позиция перестаёт предлагаться в новых формах.
 */
export async function setDictionaryItemActive(id: string, isActive: boolean): Promise<void> {
  await db.dictionaryItem.update({ where: { id }, data: { isActive } });
}

export async function renameDictionaryItem(id: string, name: string): Promise<void> {
  const value = name.trim();
  if (!value) throw new Error("Название не может быть пустым");
  await db.dictionaryItem.update({ where: { id }, data: { name: value } });
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

/** Транспортные компании для подсказки в блоке доставки. */
export async function getCarriers(): Promise<string[]> {
  const items = await listDictionary("CARRIER", true);
  return items.map((item) => item.name);
}
