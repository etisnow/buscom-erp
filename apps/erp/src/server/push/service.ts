import "server-only";
import webpush, { WebPushError } from "web-push";
import type { PushPayload, PushSubscriptionInput } from "@buscom/domain/push/payload";
import { db } from "@/server/db";
import { env } from "@/server/env";

/**
 * Пуш-уведомления (Web Push). Ключи VAPID — подпись нашего сервера для сервисов
 * пушей — создаются при первом обращении и лежат в настройках (`Setting`), а не в
 * окружении: в бою их не нужно заводить руками, и они не меняются при выкате.
 * Смена ключей отвязала бы все подписки — поэтому их нигде не перегенерируем.
 */

const VAPID_SETTING = "push.vapid";

type VapidKeys = { publicKey: string; privateKey: string };

let cachedKeys: VapidKeys | null = null;

async function vapidKeys(): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;
  const stored = await db.setting.findUnique({ where: { key: VAPID_SETTING }, select: { value: true } });
  if (!stored) {
    // Два запроса могут создать ключи одновременно: записываются первые, остальные
    // пропускаются, и все читают записанные.
    const { publicKey, privateKey } = webpush.generateVAPIDKeys();
    await db.setting.createMany({
      data: [{ key: VAPID_SETTING, value: { publicKey, privateKey } }],
      skipDuplicates: true,
    });
  }
  const row =
    stored ?? (await db.setting.findUniqueOrThrow({ where: { key: VAPID_SETTING }, select: { value: true } }));
  cachedKeys = row.value as VapidKeys;
  return cachedKeys;
}

/** Открытый ключ для `pushManager.subscribe` в браузере. */
export async function vapidPublicKey(): Promise<string> {
  return (await vapidKeys()).publicKey;
}

/**
 * Контакт отправителя для сервисов пушей: https-адрес ERP или почта.
 * Apple отклоняет пуши с адресом localhost, поэтому в разработке — почта.
 */
function vapidSubject(): string {
  return env.BETTER_AUTH_URL.startsWith("https://") ? env.BETTER_AUTH_URL : "mailto:noreply@bus-com.ru";
}

/** Включить уведомления на устройстве. Тот же адрес у другого сотрудника переходит к текущему. */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const data = {
    userId,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    userAgent: userAgent?.slice(0, 300) ?? null,
  };
  await db.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    create: { endpoint: subscription.endpoint, ...data },
    update: data,
  });
}

/** Выключить на устройстве. Удаляется только своя подписка. */
export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
}

export async function countPushDevices(userId: string): Promise<number> {
  return db.pushSubscription.count({ where: { userId } });
}

/** Уведомление долежит у сервиса пушей сутки, пока телефон вне сети; потом теряет смысл. */
const TTL_SECONDS = 24 * 60 * 60;

export type PushSummary = { sent: number; removed: number; failed: number };

/**
 * Отправить уведомление на все устройства сотрудников. Подписки, от которых
 * сервис отказался (404/410: приложение удалили, разрешение отозвали), удаляются.
 * Остальные ошибки только в лог: повтор не нужен — сообщение и так видно в чате.
 */
export async function sendPush(where: { userIds: string[] }, payload: PushPayload): Promise<PushSummary> {
  const summary: PushSummary = { sent: 0, removed: 0, failed: 0 };
  if (!where.userIds.length) return summary;

  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: { in: where.userIds }, user: { isActive: true } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
  });
  if (!subscriptions.length) return summary;

  const keys = await vapidKeys();
  const options: webpush.RequestOptions = {
    vapidDetails: { subject: vapidSubject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
    TTL: TTL_SECONDS,
    urgency: "high",
    // Пока телефон вне сети, сервис держит только последнее уведомление темы, а не пачку
    topic: payload.tag,
    timeout: 10_000,
  };
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          body,
          options,
        );
        await db.pushSubscription.update({
          where: { id: subscription.id },
          data: { lastSentAt: new Date() },
          select: { id: true },
        });
        summary.sent++;
      } catch (error) {
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          await db.pushSubscription.deleteMany({ where: { id: subscription.id } });
          summary.removed++;
          return;
        }
        summary.failed++;
        const reason = error instanceof WebPushError ? `${error.statusCode} ${error.body}` : String(error);
        console.error(`[push] Не доставлено на ${new URL(subscription.endpoint).host}: ${reason}`);
      }
    }),
  );
  return summary;
}
