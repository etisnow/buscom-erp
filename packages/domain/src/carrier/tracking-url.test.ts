import { describe, expect, it } from "vitest";
import { carrierTrackingUrl } from "./tracking-url";

describe("carrierTrackingUrl", () => {
  it("ссылки на отслеживание СДЭК, ДЛ и ПЭК; номер кодируется", () => {
    expect(carrierTrackingUrl("СДЭК", "1023456789")).toBe("https://www.cdek.ru/ru/tracking?order_id=1023456789");
    expect(carrierTrackingUrl("Деловые линии", "400267443")).toBe("https://www.dellin.ru/tracker/orders/400267443/");
    expect(carrierTrackingUrl("ПЭК", "780339690775")).toBe(
      "https://pecom.ru/services-are/order-status/?code=780339690775",
    );
    expect(carrierTrackingUrl("СДЭК", "a b&c")).toBe("https://www.cdek.ru/ru/tracking?order_id=a%20b%26c");
  });

  it("у КИТ, неизвестной ТК и без номера ссылки нет", () => {
    expect(carrierTrackingUrl("КИТ (GTD)", "ТБЛЕКБ0010000111")).toBeNull();
    expect(carrierTrackingUrl("Байкал Сервис", "123")).toBeNull();
    expect(carrierTrackingUrl("СДЭК", "  ")).toBeNull();
    expect(carrierTrackingUrl(null, "123")).toBeNull();
  });
});
