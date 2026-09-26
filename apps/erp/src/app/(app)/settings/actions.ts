"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { notificationTopicsSchema } from "@buscom/domain/notification/topics";
import { pushSubscriptionSchema } from "@buscom/domain/push/payload";
import { notificationAddress, notificationEmailSchema } from "@buscom/domain/user/settings";
import { mailConfigured, sendLetter, testNotificationLetter } from "@/server/mail";
import { removePushSubscription, savePushSubscription, sendPush } from "@/server/push/service";
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

/** Включить пуши на этом устройстве: подписку браузера сохраняем за сотрудником из сессии. */
export async function subscribePushAction(subscription: unknown): Promise<UserSettingsResult> {
  const user = await requireUser();
  const parsed = pushSubscriptionSchema.safeParse(subscription);
  if (!parsed.success) return { ok: false, error: "Браузер прислал неподходящую подписку" };
  await savePushSubscription(user.id, parsed.data, (await headers()).get("user-agent"));
  return { ok: true, message: "Уведомления на этом устройстве включены" };
}

export async function unsubscribePushAction(endpoint: string): Promise<UserSettingsResult> {
  const user = await requireUser();
  const parsed = z.string().min(1).max(1000).safeParse(endpoint);
  if (!parsed.success) return { ok: false, error: "Неизвестное устройство" };
  await removePushSubscription(user.id, parsed.data);
  return { ok: true, message: "Уведомления на этом устройстве выключены" };
}

/** Проверочный пуш на все свои устройства. */
export async function sendTestPushAction(): Promise<UserSettingsResult> {
  const user = await requireUser();
  const summary = await sendPush(
    { userIds: [user.id] },
    { title: "BusCom ERP", body: "Проверка: уведомления работают", url: "/settings", tag: "test" },
  );
  if (summary.sent) return { ok: true, message: `Отправлено на устройств: ${summary.sent}` };
  if (summary.removed) return { ok: false, error: "Подписка устарела — выключите и включите уведомления заново" };
  return { ok: false, error: "Не удалось отправить — подробности в логе сервера" };
}
