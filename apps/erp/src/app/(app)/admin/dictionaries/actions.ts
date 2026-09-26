"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { discountLimitSchema, sellerRequisitesSchema, slaMinutesSchema } from "@buscom/domain/settings";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import {
  addDictionaryItem,
  deleteDictionaryItem,
  renameDictionaryItem,
  saveDiscountLimit,
  saveSellerRequisites,
  saveSlaMinutes,
  setDictionaryItemActive,
} from "@/server/settings/service";
import { requireUser } from "@/server/session";

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string };

const dictionaryTypeSchema = z.enum(["CANCEL_REASON", "CARRIER", "ORDER_SOURCE", "CAR_MODEL"]);

async function run(action: () => Promise<unknown>, message: string): Promise<SettingsResult> {
  try {
    await action();
    revalidatePath("/admin/dictionaries");
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить" };
  }
}

export async function addDictionaryItemAction(type: string, name: string): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = dictionaryTypeSchema.safeParse(type);
  if (!parsed.success) return { ok: false, error: "Неизвестный справочник" };

  return run(() => addDictionaryItem(parsed.data, name), "Добавлено");
}

export async function toggleDictionaryItemAction(id: string, isActive: boolean): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  return run(() => setDictionaryItemActive(id, isActive), isActive ? "Включено" : "Выключено");
}

export async function deleteDictionaryItemAction(id: string): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  return run(() => deleteDictionaryItem(id), "Удалено");
}

export async function renameDictionaryItemAction(id: string, name: string): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  return run(() => renameDictionaryItem(id, name), "Переименовано");
}

export async function saveDiscountLimitAction(percent: number): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = discountLimitSchema.safeParse(percent);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => saveDiscountLimit(parsed.data, user.id), "Лимит скидки сохранён");
}

export async function saveSlaAction(minutes: Record<string, number | null>): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = slaMinutesSchema.safeParse(minutes);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => saveSlaMinutes(parsed.data, user.id), "Нормативы SLA сохранены");
}

export async function saveRequisitesAction(
  requisites: z.input<typeof sellerRequisitesSchema>,
): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = sellerRequisitesSchema.safeParse(requisites);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => saveSellerRequisites(parsed.data, user.id), "Реквизиты сохранены");
}
