import { describe, expect, it } from "vitest";
import {
  chatPushPayload,
  isPushServiceHost,
  MAX_PUSH_BODY,
  notificationPushPayload,
  pushSubscriptionSchema,
} from "./payload";
import { GENERAL_CHAT_ROOM_ID } from "../chat/room";

describe("pushSubscriptionSchema", () => {
  const keys = { p256dh: "BNc...", auth: "tBH..." };

  it("принимает подписку браузера", () => {
    const parsed = pushSubscriptionSchema.parse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      expirationTime: null,
      keys,
    });
    expect(parsed).toEqual({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys });
  });

  it("не принимает адрес не по https и подписку без ключей", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "http://example.com/push", keys }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "file:///etc/passwd", keys }).success).toBe(false);
    expect(
      pushSubscriptionSchema.safeParse({ endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: {} }).success,
    ).toBe(false);
  });

  it("только сервисы пушей браузеров", () => {
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://example.com/push", keys }).success).toBe(false);
    expect(pushSubscriptionSchema.safeParse({ endpoint: "https://127.0.0.1/push", keys }).success).toBe(false);
  });
});

describe("isPushServiceHost", () => {
  it("знает Google, Apple, Mozilla и Microsoft", () => {
    expect(isPushServiceHost("fcm.googleapis.com")).toBe(true);
    expect(isPushServiceHost("web.push.apple.com")).toBe(true);
    expect(isPushServiceHost("updates.push.services.mozilla.com")).toBe(true);
    expect(isPushServiceHost("wns2-par02p.notify.windows.com")).toBe(true);
  });

  it("похожие имена — нет", () => {
    expect(isPushServiceHost("evilgoogleapis.com")).toBe(false);
    expect(isPushServiceHost("googleapis.com.evil.ru")).toBe(false);
    expect(isPushServiceHost("localhost")).toBe(false);
  });
});

describe("chatPushPayload", () => {
  const general = { id: GENERAL_CHAT_ROOM_ID, name: "Общий чат" };

  it("комната и автор в заголовке, текст в одну строку, нажатие ведёт в комнату", () => {
    expect(
      chatPushPayload({ room: general, authorName: "Максим", text: "привет\n\nкак дела", attachmentCount: 0 }),
    ).toEqual({
      title: "Общий чат · Максим",
      body: "привет как дела",
      url: "/chat",
      tag: "chat:chat_room_general",
    });
    const other = chatPushPayload({
      room: { id: "r1", name: "Склад" },
      authorName: "А",
      text: "x",
      attachmentCount: 0,
    });
    expect(other).toMatchObject({ title: "Склад · А", url: "/chat/r1", tag: "chat:r1" });
  });

  it("длинный текст обрезается", () => {
    const { body } = chatPushPayload({ room: general, authorName: "А", text: "я".repeat(500), attachmentCount: 0 });
    expect(body).toHaveLength(MAX_PUSH_BODY);
    expect(body.endsWith("…")).toBe(true);
  });

  it("файлы — отдельной строкой с числом", () => {
    const files = (text: string, attachmentCount: number) =>
      chatPushPayload({ room: general, authorName: "А", text, attachmentCount }).body;
    expect(files("смотри", 1)).toBe("смотри\n📎 1 файл");
    expect(files("", 3)).toBe("📎 3 файла");
    expect(files("", 5)).toBe("📎 5 файлов");
    expect(files("", 11)).toBe("📎 11 файлов");
  });
});

describe("notificationPushPayload", () => {
  const letter = {
    subject: "BusCom ERP: Новый заказ №3021",
    text: [
      "Новый заказ №3021 — Пришёл с сайта.",
      "",
      "Клиент: ООО «Ромашка»",
      "Сумма заказа: 27 000 ₽",
      "Оплата: Не оплачен",
      "",
      "https://erp.bus-com.ru/orders/3021",
    ].join("\n"),
  };

  it("заголовок — тема письма без «BusCom ERP: », текст — строки письма без ссылки", () => {
    expect(notificationPushPayload({ id: "n1", ...letter, orderNumber: 3021 })).toEqual({
      title: "Новый заказ №3021",
      body: "Новый заказ №3021 — Пришёл с сайта.\nКлиент: ООО «Ромашка»\nСумма заказа: 27 000 ₽\nОплата: Не оплачен",
      url: "/orders/3021",
      tag: "n1",
    });
  });

  it("без заказа нажатие ведёт на главную; длинный текст обрезается", () => {
    const payload = notificationPushPayload({ id: "n2", subject: "Тема", text: "а".repeat(500), orderNumber: null });
    expect(payload.url).toBe("/");
    expect(payload.body).toHaveLength(MAX_PUSH_BODY);
    expect(payload.body.endsWith("…")).toBe(true);
  });

  it("пустая тема — общий заголовок", () => {
    expect(notificationPushPayload({ id: "n3", subject: "BusCom ERP: ", text: "текст", orderNumber: 1 }).title).toBe(
      "Уведомление",
    );
  });
});
