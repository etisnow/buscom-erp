import { describe, expect, it } from "vitest";
import { formatDeliveryDate, formatStepDate, orderStatusFormSchema } from "./order-status";

describe("orderStatusFormSchema", () => {
  it("номер — число, телефон — любой разборчивый формат", () => {
    expect(orderStatusFormSchema.parse({ number: " 3037 ", phone: "8 (910) 123-45-67" })).toEqual({
      number: 3037,
      phone: "8 (910) 123-45-67",
    });
  });

  it("мусор в номере и телефоне отвергается с понятным текстом", () => {
    const bad = orderStatusFormSchema.safeParse({ number: "№3037", phone: "123" });
    expect(bad.success).toBe(false);
    const messages = bad.success ? [] : bad.error.issues.map((issue) => issue.message);
    expect(messages.join(" ")).toContain("только цифры");
    expect(messages.join(" ")).toContain("Телефон");
    expect(orderStatusFormSchema.safeParse({ number: "0", phone: "+79101234567" }).success).toBe(false);
  });
});

describe("даты для клиента (по Москве)", () => {
  it("шаг шкалы — «28 сен», у «мая» без склонения", () => {
    expect(formatStepDate("2026-09-28T10:00:00.000Z")).toBe("28 сен");
    expect(formatStepDate("2026-05-09T10:00:00.000Z")).toBe("9 мая");
  });

  it("день считается по Москве: 21:30 UTC — уже следующий день", () => {
    expect(formatStepDate("2026-09-28T21:30:00.000Z")).toBe("29 сен");
  });

  it("ожидаемая доставка — «3 октября»", () => {
    expect(formatDeliveryDate("2026-10-02T21:00:00.000Z")).toBe("3 октября");
  });
});
