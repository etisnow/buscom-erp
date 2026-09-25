import { beforeEach, expect, it, vi } from "vitest";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";

const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", async (importOriginal) => {
  // CommonJS-модуль: сервис берёт его импортом по умолчанию, поэтому подменяем и default
  const original = await importOriginal<typeof import("web-push") & { default: typeof import("web-push") }>();
  return {
    ...original,
    default: { ...original.default, sendNotification },
    sendNotification,
  };
});

const { countPushDevices, removePushSubscription, savePushSubscription, sendPush, vapidPublicKey } =
  await import("@/server/push/service");
const { WebPushError } = await import("web-push");

const keys = { p256dh: "p256dh-key", auth: "auth-key" };
const payload = { title: "Т", body: "Б", url: "/chat", tag: "chat" };

describeDb("пуш-уведомления (живая БД, сервис пушей подменён)", () => {
  let first: SessionUser;
  let second: SessionUser;

  beforeEach(async () => {
    await resetDb();
    sendNotification.mockReset();
    sendNotification.mockResolvedValue({ statusCode: 201 });
    first = await makeUser("MANAGER", "Первый");
    second = await makeUser("HEAD", "Второй");
  });

  it("ключи VAPID создаются один раз и дальше те же", async () => {
    const key = await vapidPublicKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(await vapidPublicKey()).toBe(key);
    expect(await testDb.setting.count({ where: { key: "push.vapid" } })).toBe(1);
  });

  it("устройство сохраняется, повторная подписка его не дублирует, выключает только владелец", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/a";
    await savePushSubscription(first.id, { endpoint, keys }, "Chrome");
    await savePushSubscription(first.id, { endpoint, keys }, "Chrome");
    expect(await countPushDevices(first.id)).toBe(1);

    await removePushSubscription(second.id, endpoint);
    expect(await countPushDevices(first.id)).toBe(1);
    await removePushSubscription(first.id, endpoint);
    expect(await countPushDevices(first.id)).toBe(0);
  });

  it("то же устройство под другим сотрудником переходит к нему", async () => {
    const endpoint = "https://fcm.googleapis.com/fcm/send/shared";
    await savePushSubscription(first.id, { endpoint, keys }, null);
    await savePushSubscription(second.id, { endpoint, keys }, null);
    expect(await countPushDevices(first.id)).toBe(0);
    expect(await countPushDevices(second.id)).toBe(1);
  });

  it("шлёт на устройства адресатов, отвергнутые сервисом удаляет", async () => {
    await savePushSubscription(first.id, { endpoint: "https://fcm.googleapis.com/fcm/send/ok", keys }, null);
    await savePushSubscription(first.id, { endpoint: "https://web.push.apple.com/gone", keys }, null);
    await savePushSubscription(second.id, { endpoint: "https://fcm.googleapis.com/fcm/send/other", keys }, null);
    sendNotification.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.includes("gone")) {
        throw new WebPushError("Gone", 410, {}, "", subscription.endpoint);
      }
      return { statusCode: 201 };
    });

    const summary = await sendPush({ userIds: [first.id] }, payload);
    expect(summary).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(sendNotification).toHaveBeenCalledTimes(2);
    expect(JSON.parse(sendNotification.mock.calls[0][1] as string)).toEqual(payload);
    expect(await countPushDevices(first.id)).toBe(1);
    expect(await countPushDevices(second.id)).toBe(1);
  });

  it("деактивированному не шлёт", async () => {
    await savePushSubscription(first.id, { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys }, null);
    await testDb.user.update({ where: { id: first.id }, data: { isActive: false } });
    expect(await sendPush({ userIds: [first.id] }, payload)).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
