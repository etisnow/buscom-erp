import { describe, expect, it } from "vitest";
import { formatMoscowDate, formatMoscowDateTime, formatPhone } from "./datetime";

describe("формат времени", () => {
  it("показывает UTC-время в московском поясе", () => {
    // 11:35 UTC = 14:35 МСК
    expect(formatMoscowDateTime(new Date("2026-09-20T11:35:00Z"))).toBe("20.09.2026, 14:35");
  });

  it("поздний вечер по UTC — уже следующий день в Москве", () => {
    expect(formatMoscowDate(new Date("2026-09-20T22:00:00Z"))).toBe("21.09.2026");
  });
});

describe("formatPhone", () => {
  it("разбивает нормализованный номер", () => {
    expect(formatPhone("+79161234567")).toBe("+7 (916) 123-45-67");
  });

  it("ненормализованный отдаёт как есть", () => {
    expect(formatPhone("8916123")).toBe("8916123");
  });

  it("пустое значение — пустая строка", () => {
    expect(formatPhone(null)).toBe("");
  });
});
