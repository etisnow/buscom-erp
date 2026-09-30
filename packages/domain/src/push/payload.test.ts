import { describe, expect, it } from "vitest";
import {
  chatPushPayload,
  isPushServiceHost,
  MAX_PUSH_BODY,
  notificationPushPayload,
  pushSubscriptionSchema,
} from "./payload";

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
  it("автор в заголовке, текст в одну строку, нажатие ведёт в чат", () => {
    expect(chatPushPayload({ authorName: "Максим", text: "привет\n\nкак дела", attachmentCount: 0 })).toEqual({
      title: "Чат · Максим",
      body: "привет как дела",
      url: "/chat",
      tag: "chat",
    });
  });

  it("длинный текст обрезается", () => {
    const { body } = chatPushPayload({ authorName: "А", text: "я".repeat(500), attachmentCount: 0 });
    expect(body).toHaveLength(MAX_PUSH_BODY);
    expect(body.endsWith("…")).toBe(true);
  });

  it("файлы — отдельной строкой с числом", () => {
    expect(chatPushPayload({ authorName: "А", text: "смотри", attachmentCount: 1 }).body).toBe("смотри\n📎 1 файл");
    expect(chatPushPayload({ authorName: "А", text: "", attachmentCount: 3 }).body).toBe("📎 3 файла");
    expect(chatPushPayload({ authorName: "А", text: "", attachmentCount: 5 }).body).toBe("📎 5 файлов");
    expect(chatPushPayload({ authorName: "А", text: "", attachmentCount: 11 }).body).toBe("📎 11 файлов");
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
