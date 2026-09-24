"use server";

import { revalidatePath } from "next/cache";
import { notificationTopicsSchema } from "@/domain/notification/topics";
import { notificationAddress, notificationEmailSchema } from "@/domain/user/settings";
import { mailConfigured, sendLetter, testNotificationLetter } from "@/server/mail";
import { requireUser } from "@/server/session";
import { saveNotificationEmail, saveNotificationTopics } from "@/server/users/settings";

export type UserSettingsResult = { ok: true; message: string } | { ok: false; error: string };

/** Любой сотрудник правит только себя — id из сессии, не с клиента. */
export async function saveNotificationEmailAction(value: string): Promise<UserSettingsResult> {
  const user = await requireUser();
  const parsed = notificationEmailSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте адрес почты" };

  try {
    await saveNotificationEmail(user.id, parsed.data);
    revalidatePath("/settings");
    return { ok: true, message: parsed.data ? "Сохранено" : "Адрес убран — уведомления пойдут на адрес входа" };
  } catch {
    return { ok: false, error: "Не удалось сохранить" };
  }
}

export async function saveNotificationTopicsAction(topics: string[]): Promise<UserSettingsResult> {
  const user = await requireUser();
  const parsed = notificationTopicsSchema.safeParse(topics);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Не удалось разобрать подписки" };

  try {
    await saveNotificationTopics(user.id, parsed.data);
    revalidatePath("/settings");
    return { ok: true, message: "Подписки сохранены" };
  } catch {
    return { ok: false, error: "Не удалось сохранить" };
  }
}

/** Чтобы кнопкой нельзя было засыпать чужой ящик: одно письмо в полминуты на сотрудника. */
const TEST_LETTER_COOLDOWN_MS = 30_000;
const lastTestLetterAt = new Map<string, number>();

/**
 * Тестовое уведомление на адрес из поля — в том числе ещё не сохранённый,
 * чтобы проверить его до сохранения. Пустое поле — адрес входа, как у настоящих уведомлений.
 */
export async function sendTestNotificationAction(value: string): Promise<UserSettingsResult> {
  const user = await requireUser();
  const parsed = notificationEmailSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Проверьте адрес почты" };

  if (!(await mailConfigured())) {
    return { ok: false, error: "Почта в системе не настроена — письма не уходят. Обратитесь к администратору" };
  }

  const now = Date.now();
  const last = lastTestLetterAt.get(user.id);
  if (last && now - last < TEST_LETTER_COOLDOWN_MS) {
    return { ok: false, error: "Письмо уже отправлено — подождите полминуты перед следующим" };
  }
  lastTestLetterAt.set(user.id, now);

  const to = notificationAddress({ email: user.email, notificationEmail: parsed.data });
  try {
    await sendLetter(testNotificationLetter(to, user.name));
    return { ok: true, message: `Письмо отправлено на ${to}` };
  } catch (error) {
    lastTestLetterAt.delete(user.id);
    const reason = error instanceof Error ? error.message : "неизвестная ошибка";
    return { ok: false, error: `Не удалось отправить: ${reason}` };
  }
}
