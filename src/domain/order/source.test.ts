import { describe, expect, it } from "vitest";
import { canChangeOrderSource, isSystemOrderSource, orderSourceLabel } from "./source";

describe("источник заказа", () => {
  it("сайт и прежняя ERP — системные, остальные нет", () => {
    expect(isSystemOrderSource("SITE")).toBe(true);
    expect(isSystemOrderSource("LEGACY")).toBe(true);
    expect(isSystemOrderSource("PHONE")).toBe(false);
    expect(isSystemOrderSource("OTHER")).toBe(false);
  });

  it("у заказа с сайта и архивного источник не меняется, у заведённого руками — меняется", () => {
    expect(canChangeOrderSource("SITE")).toBe(false);
    expect(canChangeOrderSource("LEGACY")).toBe(false);
    expect(canChangeOrderSource("PHONE")).toBe(true);
  });

  it("подпись — из справочника, а без пункта — запасная по каналу", () => {
    expect(orderSourceLabel("OTHER", "Авито")).toBe("Авито");
    expect(orderSourceLabel("PHONE", null)).toBe("Телефон");
  });
});
