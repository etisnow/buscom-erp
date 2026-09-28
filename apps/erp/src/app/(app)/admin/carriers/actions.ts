"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  carrierSettingsSchema,
  DEFAULT_CARRIER_SETTINGS,
  mergeCarrierSettings,
  mergePecSettings,
} from "@buscom/domain/settings";
import type { TerminalCarrier } from "@buscom/db/enums";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { checkDellinAppKey } from "@/server/carriers/dellin";
import { checkPecCredentials } from "@/server/carriers/pec";
import { describeTerminalSync, syncTerminals } from "@/server/carriers/terminals";
import { readSettings, saveCarrierSettings } from "@/server/settings/service";
import { requireUser } from "@/server/session";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";

/** «Администрирование → Транспортные компании»: ключи API перевозчиков. */

/** Ключ в форму не отдаётся и приходит пустым, если его не меняли, — тогда остаётся сохранённый. */
export async function saveCarrierSettingsAction(
  settings: z.input<typeof carrierSettingsSchema>,
): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = carrierSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  try {
    await saveCarrierSettings(mergeCarrierSettings(current.carriers, parsed.data), user.id);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить" };
  }
  revalidatePath("/admin/carriers");
  return { ok: true, message: "Ключ «Деловых Линий» сохранён" };
}

export async function clearDellinKeyAction(): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const current = await readSettings();
  await saveCarrierSettings({ ...current.carriers, dellinAppKey: DEFAULT_CARRIER_SETTINGS.dellinAppKey }, user.id);
  revalidatePath("/admin/carriers");
  return { ok: true, message: "Ключ «Деловых Линий» удалён" };
}

/** Ключ Яндекс Карт — не секрет, в форме виден как есть; пустое поле — карты на сайте нет. */
export async function saveMapsKeyAction(yandexMapsApiKey: string): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = carrierSettingsSchema.shape.yandexMapsApiKey.safeParse(yandexMapsApiKey);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  await saveCarrierSettings({ ...current.carriers, yandexMapsApiKey: parsed.data }, user.id);
  revalidatePath("/admin/carriers");
  return {
    ok: true,
    message: parsed.data
      ? "Ключ карт сохранён — сайт подхватит его в течение 10 минут"
      : "Ключ карт убран — на сайте терминалы выбираются без карты",
  };
}

const carrierSchema = z.enum(["DELLIN", "PEC"] satisfies TerminalCarrier[]);

/** Обновить справочник пунктов перевозчика сейчас, не дожидаясь суточного прохода. */
export async function syncTerminalsAction(carrierInput: TerminalCarrier): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  const carrier = carrierSchema.parse(carrierInput);
  try {
    const summary = await syncTerminals(carrier);
    if (!summary) return { ok: false, error: "Сначала сохраните ключ перевозчика" };
    revalidatePath("/admin/carriers");
    return { ok: true, message: `Справочник обновлён: ${describeTerminalSync(carrier, summary)}` };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return { ok: false, error: `Справочник не обновлён: ${reason}` };
  }
}

/** Проверка ключа из формы — до сохранения; пустое поле — проверяется сохранённый. */
export async function checkDellinKeyAction(settings: z.input<typeof carrierSettingsSchema>): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = carrierSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const { dellinAppKey } = mergeCarrierSettings((await readSettings()).carriers, parsed.data);
  if (!dellinAppKey) return { ok: false, error: "Впишите ключ — проверять нечего" };

  try {
    const result = await checkDellinAppKey(dellinAppKey);
    return result.ok ? { ok: true, message: "Ключ работает: ДЛ отдают справочник терминалов" } : result;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return { ok: false, error: `ДЛ недоступны: ${reason}` };
  }
}

const pecInputSchema = carrierSettingsSchema.pick({ pecLogin: true, pecApiKey: true });

/** Логин и ключ ПЭК. Ключ в форму не отдаётся: пустое поле — оставить сохранённый. */
export async function savePecAction(input: z.input<typeof pecInputSchema>): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = pecInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const merged = mergePecSettings((await readSettings()).carriers, parsed.data);
  await saveCarrierSettings(merged, user.id);
  revalidatePath("/admin/carriers");
  return { ok: true, message: "Доступ к API ПЭК сохранён" };
}

export async function clearPecAction(): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const current = await readSettings();
  await saveCarrierSettings({ ...current.carriers, pecLogin: "", pecApiKey: "" }, user.id);
  revalidatePath("/admin/carriers");
  return { ok: true, message: "Доступ к API ПЭК удалён" };
}

/** Проверка логина и ключа из формы — до сохранения; пустой ключ — проверяется сохранённый. */
export async function checkPecAction(input: z.input<typeof pecInputSchema>): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = pecInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const { pecLogin, pecApiKey } = mergePecSettings((await readSettings()).carriers, parsed.data);
  if (!pecLogin || !pecApiKey) return { ok: false, error: "Впишите логин и ключ — проверять нечего" };
  const result = await checkPecCredentials({ login: pecLogin, apiKey: pecApiKey });
  return result.ok ? { ok: true, message: "Доступ работает: ПЭК отдают список отделений" } : result;
}
