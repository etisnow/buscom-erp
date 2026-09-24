"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emailTemplatesSchema } from "@/domain/email/templates";
import {
  imapConfigured,
  imapSettingsSchema,
  mergeImapSettings,
  mergeSmtpSettings,
  smtpConfigured,
  smtpSettingsSchema,
} from "@/domain/settings";
import { ADMIN_ROLES } from "@/domain/user/role";
import type { MailFolder } from "@/domain/email/folders";
import { listMailboxFolders, testMailboxConnection } from "@/server/integrations/mailbox";
import { sendTestLetter } from "@/server/mail";
import { readSettings, saveEmailTemplates, saveImapSettings, saveSmtpSettings } from "@/server/settings/service";
import { requireUser } from "@/server/session";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";

/** «Администрирование → Настройки почты»: исходящая, входящая и шаблоны писем клиенту. */

async function run(action: () => Promise<unknown>, message: string): Promise<SettingsResult> {
  try {
    await action();
    revalidatePath("/admin/mail");
    return { ok: true, message };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сохранить" };
  }
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

export async function saveEmailTemplatesAction(
  templates: z.input<typeof emailTemplatesSchema>,
): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = emailTemplatesSchema.safeParse(templates);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(() => saveEmailTemplates(parsed.data, user.id), "Шаблоны писем сохранены");
}

/**
 * Входящая почта. Пароль, как и у SMTP, в форму не отдаётся: пустое поле —
 * «оставить сохранённый». Опрос подхватит новые настройки следующим проходом.
 */
export async function saveImapAction(settings: z.input<typeof imapSettingsSchema>): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = imapSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  const merged = mergeImapSettings(current.imap, parsed.data);
  return run(
    () => saveImapSettings(merged, user.id),
    imapConfigured(merged)
      ? "Настройки входящей почты сохранены — ящик проверится следующим проходом"
      : "Входящая почта в интерфейсе не задана — берутся переменные окружения, если они есть",
  );
}

/** Проверка подключения тем, что в форме, — до сохранения. Ничего не сохраняет. */
export async function testImapAction(settings: z.input<typeof imapSettingsSchema>): Promise<SettingsResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = imapSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  const merged = mergeImapSettings(current.imap, parsed.data);
  if (!imapConfigured(merged)) return { ok: false, error: "Заполните сервер, пользователя и пароль" };

  try {
    const { messages } = await testMailboxConnection(merged);
    return { ok: true, message: `Подключение есть: во входящих ${messages} писем` };
  } catch (error) {
    // Текст ошибки imapflow показываем как есть: без него непонятно, что чинить
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return { ok: false, error: `Не удалось подключиться: ${reason}` };
  }
}

export type FoldersResult = { ok: true; folders: MailFolder[] } | { ok: false; error: string };

/** Папки ящика с числом писем — тем подключением, что в форме. Ничего не сохраняет. */
export async function listImapFoldersAction(settings: z.input<typeof imapSettingsSchema>): Promise<FoldersResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = imapSettingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const current = await readSettings();
  const merged = mergeImapSettings(current.imap, parsed.data);
  if (!imapConfigured(merged)) return { ok: false, error: "Заполните сервер, пользователя и пароль" };

  try {
    return { ok: true, folders: await listMailboxFolders(merged) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return { ok: false, error: `Не удалось получить папки: ${reason}` };
  }
}
