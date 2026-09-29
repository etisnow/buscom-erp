"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DEFAULT_SERVICE_SETTINGS, mergeServiceSettings, serviceSettingsSchema } from "@buscom/domain/settings";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { readSettings, saveServiceSettings } from "@/server/settings/service";
import { requireUser } from "@/server/session";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";

/** «Администрирование → Внешние сервисы»: ключи API сторонних сервисов. */

/** Ключ в форму не отдаётся и приходит пустым, если его не меняли, — тогда остаётся сохранённый. */
export async function saveDewatermarkKeyAction(dewatermarkApiKey: string): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = serviceSettingsSchema.safeParse({ dewatermarkApiKey });
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  try {
    await saveServiceSettings(mergeServiceSettings(current.services, parsed.data), user.id);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить" };
  }
  revalidatePath("/admin/services");
  return { ok: true, message: "Ключ dewatermark.ai сохранён" };
}

export async function clearDewatermarkKeyAction(): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const current = await readSettings();
  await saveServiceSettings(
    { ...current.services, dewatermarkApiKey: DEFAULT_SERVICE_SETTINGS.dewatermarkApiKey },
    user.id,
  );
  revalidatePath("/admin/services");
  return { ok: true, message: "Ключ dewatermark.ai удалён" };
}
