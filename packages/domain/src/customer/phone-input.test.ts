import { describe, expect, it } from "vitest";
import { formatPhoneInput, normalizePhone, PHONE_INPUT_PREFIX } from "./phone";

describe("поле телефона на сайте: +7 сразу", () => {
  it("пустое поле и стёртый префикс — снова «+7 »", () => {
    expect(formatPhoneInput("")).toBe(PHONE_INPUT_PREFIX);
    expect(formatPhoneInput("+7")).toBe(PHONE_INPUT_PREFIX);
    expect(formatPhoneInput("+")).toBe(PHONE_INPUT_PREFIX);
  });

  it("набор после +7 раскладывается по группам", () => {
    expect(formatPhoneInput("+7 9")).toBe("+7 9");
    expect(formatPhoneInput("+7 9123")).toBe("+7 912 3");
    expect(formatPhoneInput("+7 912 3456")).toBe("+7 912 345-6");
    expect(formatPhoneInput("+7 912 345-678")).toBe("+7 912 345-67-8");
    expect(formatPhoneInput("+7 912 345-67-89")).toBe("+7 912 345-67-89");
  });

  it("лишние цифры отбрасываются", () => {
    expect(formatPhoneInput("+7 912 345-67-890")).toBe("+7 912 345-67-89");
  });

  it("вставка и автозаполнение в любом виде", () => {
    expect(formatPhoneInput("89123456789")).toBe("+7 912 345-67-89");
    expect(formatPhoneInput("79123456789")).toBe("+7 912 345-67-89");
    expect(formatPhoneInput("+7 (912) 345-67-89")).toBe("+7 912 345-67-89");
    expect(formatPhoneInput("9123456789")).toBe("+7 912 345-67-89");
    expect(formatPhoneInput("+79123456789")).toBe("+7 912 345-67-89");
  });

  it("собранный номер сервер принимает", () => {
    expect(normalizePhone(formatPhoneInput("89123456789"))).toBe("+79123456789");
  });
});
