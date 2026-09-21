"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  discountLimitSchema,
  mergeSmtpSettings,
  sellerRequisitesSchema,
  slaMinutesSchema,
  smtpConfigured,
  smtpSettingsSchema,
} from "@/domain/settings";
import { ADMIN_ROLES } from "@/domain/user/role";
import {
  addDictionaryItem,
  deleteDictionaryItem,
  renameDictionaryItem,
  saveDiscountLimit,
  readSettings,
  saveSellerRequisites,
  saveSlaMinutes,
  saveSmtpSettings,
  setDictionaryItemActive,
} from "@/server/settings/service";
import { sendTestLetter } from "@/server/mail";
import { requireUser } from "@/server/session";

export type SettingsResult = { ok: true; message: string } | { ok: false; error: string };

const dictionaryTypeSchema = z.enum(["CANCEL_REASON", "CARRIER", "ORDER_SOURCE"]);

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

/**
 * Настройки почты. Пароль в форму не отдаётся и приходит пустым, если его не
 * меняли, — `mergeSmtpSettings` оставляет в этом случае сохранённый.
 */
export async function saveSmtpAction(settings: z.input<typeof smtpSettingsSchema>): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = smtpSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  const merged = mergeSmtpSettings(current.smtp, parsed.data);

  return run(
    () => saveSmtpSettings(merged, user.id),
    merged.host ? "Настройки почты сохранены" : "Почта выключена — письма будут писаться в лог сервера",
  );
}

/**
 * Проверочное письмо — на адрес того, кто нажал. Проверяются настройки из формы,
 * а не сохранённые: смысл кнопки в том, чтобы убедиться до сохранения. Пароль,
 * как и при сохранении, берётся прежний, если поле не трогали.
 *
 * Ничего не сохраняет и `revalidatePath` не делает.
 */
export async function sendTestMailAction(settings: z.input<typeof smtpSettingsSchema>): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = smtpSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  const merged = mergeSmtpSettings(current.smtp, parsed.data);
  if (!smtpConfigured(merged)) {
    return { ok: false, error: "Сначала укажите сервер — проверять нечего" };
  }

  try {
    await sendTestLetter(merged, user.email);
    return { ok: true, message: `Письмо отправлено на ${user.email}` };
  } catch (error) {
    // Текст ошибки nodemailer показываем как есть: без него непонятно, что чинить
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return { ok: false, error: `Не удалось отправить: ${reason}` };
  }
}
