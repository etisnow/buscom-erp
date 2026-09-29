"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mergeServiceSettings, serviceSettingsSchema, type ServiceSettings } from "@buscom/domain/settings";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { readSettings, saveServiceSettings } from "@/server/settings/service";
import { requireUser } from "@/server/session";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";

/** «Администрирование → Внешние сервисы»: ключи API сторонних сервисов. */

type KeyField = "dewatermarkApiKey" | "carveApiKey";

/** Ключ в форму не отдаётся и приходит пустым, если его не меняли, — тогда остаётся сохранённый. */
async function saveKey(field: KeyField, value: string, message: string): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = serviceSettingsSchema.safeParse({ [field]: value });
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  try {
    await saveServiceSettings(mergeServiceSettings(current.services, parsed.data), user.id);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить" };
  }
  revalidatePath("/admin/services");
  return { ok: true, message };
}

async function clearKey(field: KeyField, message: string): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const current = await readSettings();
  const next: ServiceSettings = { ...current.services, [field]: "" };
  await saveServiceSettings(next, user.id);
  revalidatePath("/admin/services");
  return { ok: true, message };
}

export async function saveDewatermarkKeyAction(key: string): Promise<SettingsResult> {
  return saveKey("dewatermarkApiKey", key, "Ключ dewatermark.ai сохранён");
}

export async function clearDewatermarkKeyAction(): Promise<SettingsResult> {
  return clearKey("dewatermarkApiKey", "Ключ dewatermark.ai удалён");
}

export async function saveCarveKeyAction(key: string): Promise<SettingsResult> {
  return saveKey("carveApiKey", key, "Ключ Carve сохранён");
}

export async function clearCarveKeyAction(): Promise<SettingsResult> {
  return clearKey("carveApiKey", "Ключ Carve удалён");
}
