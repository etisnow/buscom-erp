import { describe, expect, it } from "vitest";
import { buildSupplierRequest, type SupplierRequestInput } from "@/domain/order/supplier-request";

const BASE: SupplierRequestInput = {
  orderNumber: 3021,
  orderCreatedAt: new Date("2026-09-21T10:00:00Z"),
  items: [
    {
      name: "Люк вентиляционный",
      quantity: 2,
      purchasePriceKopecks: 350000,
      options: [
        { valueId: "v1", optionName: "Цвет", valueName: "серый", priceDeltaKopecks: 0 },
        { valueId: "v2", optionName: "Крепление", valueName: "болтовое", priceDeltaKopecks: 50000 },
      ],
    },
  ],
  delivery: { method: "CARRIER", carrier: "СДЭК", address: "Ростов-на-Дону, ул. Ленина, 1" },
  customer: { name: 'ООО "Ромашка"', inn: "7700000000", kpp: "770001001" },
};

describe("buildSupplierRequest", () => {
  it("собирает текст из номера, позиций, итога, доставки и покупателя без менеджера", () => {
    const text = buildSupplierRequest(BASE);

    expect(text).toContain("Заказ №3021 от 21.09.2026");
    expect(text).toContain("1. Люк вентиляционный");
    expect(text).toContain("Цвет: серый");
    expect(text).toContain("Крепление: болтовое");
    expect(text).toContain("Доставка: Транспортная компания СДЭК");
    expect(text).toContain("Адрес: Ростов-на-Дону, ул. Ленина, 1");
    expect(text).toContain('Покупатель: ООО "Ромашка", ИНН 7700000000, КПП 770001001');
    expect(text).not.toContain("Менеджер");
  });

  it("покупатель — клиент заказа, а не наша компания", () => {
    const text = buildSupplierRequest({ ...BASE, customer: { name: "БасКом", inn: null, kpp: null } });

    expect(text).not.toContain('ООО "Ромашка"');
    expect(text).toContain("Покупатель: БасКом");
  });

  it("у физлица или юрлица без реквизитов печатает только имя", () => {
    const text = buildSupplierRequest({ ...BASE, customer: { name: "Иванов Иван Иванович", inn: null, kpp: null } });

    expect(text).toContain("Покупатель: Иванов Иван Иванович");
    expect(text).not.toContain("ИНН");
    expect(text).not.toContain("КПП");
  });

  it("ИНН без КПП печатает один, без лишней запятой", () => {
    const text = buildSupplierRequest({ ...BASE, customer: { name: "ИП Петров", inn: "500100732259", kpp: null } });

    expect(text).toContain("Покупатель: ИП Петров, ИНН 500100732259");
    expect(text).not.toContain("КПП");
  });

  it("считает сумму позиции и итог по закупочным ценам", () => {
    const text = buildSupplierRequest(BASE);

    // 3500 ₽ × 2 = 7000 ₽ — и в строке позиции, и в итоге
    expect(text).toContain("2 шт");
    expect(text.replace(/\s/g, " ")).toContain("3 500 ₽ = 7 000 ₽");
    expect(text.replace(/\s/g, " ")).toContain("Итого: 7 000 ₽");
  });

  it("нумерует позиции по порядку", () => {
    const text = buildSupplierRequest({
      ...BASE,
      items: [
        { name: "Первый", quantity: 1, purchasePriceKopecks: 10000, options: [] },
        { name: "Второй", quantity: 1, purchasePriceKopecks: 20000, options: [] },
      ],
    });

    expect(text).toContain("1. Первый");
    expect(text).toContain("2. Второй");
  });

  it("позицию без закупочной цены показывает, но в итог не берёт", () => {
    const text = buildSupplierRequest({
      ...BASE,
      items: [
        { name: "С ценой", quantity: 1, purchasePriceKopecks: 10000, options: [] },
        { name: "Без цены", quantity: 3, purchasePriceKopecks: null, options: [] },
      ],
    });

    expect(text).toContain("2. Без цены");
    expect(text).toContain("3 шт — цена не указана");
    expect(text.replace(/\s/g, " ")).toContain("Итого: 100 ₽ (без позиций, у которых нет цены)");
  });

  it("без единой цены итог не печатает — складывать нечего", () => {
    const text = buildSupplierRequest({
      ...BASE,
      items: [{ name: "Без цены", quantity: 1, purchasePriceKopecks: null, options: [] }],
    });

    expect(text).not.toContain("Итого");
  });

  it("пропускает пустые блоки, не оставляя лишних переносов", () => {
    const text = buildSupplierRequest({
      ...BASE,
      delivery: { method: null, carrier: null, address: null },
    });

    expect(text).not.toContain("Доставка");
    expect(text).not.toMatch(/\n\n\n/);
    expect(text.endsWith("\n")).toBe(false);
  });

  it("способ доставки без транспортной компании печатается один", () => {
    const text = buildSupplierRequest({
      ...BASE,
      delivery: { method: "PICKUP", carrier: null, address: null },
    });

    expect(text).toContain("Доставка: Самовывоз");
    expect(text).not.toContain("Адрес:");
  });

  it("транспортную компанию без способа доставки не теряет", () => {
    const text = buildSupplierRequest({
      ...BASE,
      delivery: { method: null, carrier: "ПЭК", address: null },
    });

    expect(text).toContain("Доставка: ПЭК");
  });
});
