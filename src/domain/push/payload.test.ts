import { describe, expect, it } from "vitest";
import { chatPushPayload, isPushServiceHost, MAX_PUSH_BODY, pushSubscriptionSchema } from "@/domain/push/payload";

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
