import { describe, expect, it } from "vitest";
import { notificationAddress, notificationEmailSchema } from "@/domain/user/settings";

describe("notificationEmailSchema", () => {
  it("принимает адрес, обрезает пробелы и сводит к нижнему регистру", () => {
    expect(notificationEmailSchema.parse("  Ivan@Bus-Com.RU ")).toBe("ivan@bus-com.ru");
  });

  it("пустое поле — адрес не задан", () => {
    expect(notificationEmailSchema.parse("")).toBeNull();
    expect(notificationEmailSchema.parse("   ")).toBeNull();
  });

  it("не принимает то, что не похоже на адрес", () => {
    const result = notificationEmailSchema.safeParse("ivan@");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Проверьте адрес почты");
  });

  it("не принимает слишком длинный адрес", () => {
    expect(notificationEmailSchema.safeParse(`${"a".repeat(250)}@x.ru`).success).toBe(false);
  });
});

describe("notificationAddress", () => {
  it("своя почта главнее адреса входа", () => {
    expect(notificationAddress({ email: "login@bus-com.ru", notificationEmail: "me@mail.ru" })).toBe("me@mail.ru");
  });

  it("без своей почты — адрес входа", () => {
    expect(notificationAddress({ email: "login@bus-com.ru", notificationEmail: null })).toBe("login@bus-com.ru");
  });
});
