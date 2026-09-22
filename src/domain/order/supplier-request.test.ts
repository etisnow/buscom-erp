import { describe, expect, it } from "vitest";
import { buildSupplierRequest, type SupplierRequestInput } from "@/domain/order/supplier-request";
import { DEFAULT_SELLER_REQUISITES } from "@/domain/settings";

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
  seller: { ...DEFAULT_SELLER_REQUISITES, name: "БасКом", phone: "+7 999 000-00-00" },
};

describe("buildSupplierRequest", () => {
  it("собирает текст из номера, позиций, итога, доставки и подписи без менеджера", () => {
    const text = buildSupplierRequest(BASE);

    expect(text).toContain("Заказ №3021 от 21.09.2026");
    expect(text).toContain("1. Люк вентиляционный");
    expect(text).toContain("Цвет: серый");
    expect(text).toContain("Крепление: болтовое");
    expect(text).toContain("Доставка: Транспортная компания СДЭК");
    expect(text).toContain("Адрес: Ростов-на-Дону, ул. Ленина, 1");
    expect(text).toContain("БасКом");
    expect(text).toContain("Телефон: +7 999 000-00-00");
    expect(text).not.toContain("Менеджер");
  });

  it("включает реквизиты юрлица — ИНН, КПП, адрес и банк", () => {
    const text = buildSupplierRequest({
      ...BASE,
      seller: {
        ...DEFAULT_SELLER_REQUISITES,
        name: 'ООО "БасКом"',
        inn: "7700000000",
        kpp: "770001001",
        address: "г. Москва, ул. Ленина, 1",
        bankName: "ПАО Сбербанк",
        bankAccount: "40702810000000000000",
        correspondentAccount: "30101810400000000225",
        bic: "044525225",
        phone: "+7 999 000-00-00",
      },
    });

    expect(text).toContain('ООО "БасКом"');
    expect(text).toContain("ИНН 7700000000, КПП 770001001");
    expect(text).toContain("г. Москва, ул. Ленина, 1");
    expect(text).toContain("Банк: ПАО Сбербанк, р/с 40702810000000000000, к/с 30101810400000000225, БИК 044525225");
    expect(text).toContain("Телефон: +7 999 000-00-00");
  });

  it("незаполненные реквизиты пропускает, не оставляя пустых строк", () => {
    const text = buildSupplierRequest({
      ...BASE,
      seller: { ...DEFAULT_SELLER_REQUISITES, name: "БасКом", inn: "7700000000" },
    });

    expect(text).toContain("БасКом");
    expect(text).toContain("ИНН 7700000000");
    expect(text).not.toContain("КПП");
    expect(text).not.toContain("Банк:");
    expect(text).not.toContain("Телефон");
    expect(text).not.toMatch(/\n\n\n/);
  });

  it("считает сумму позиции и итог по закупочным ценам", () => {
    const text = buildSupplierRequest(BASE);

    // 3500 ₽ × 2 = 7000 ₽ — и в строке позиции, и в итоге
    expect(text).toContain("2 шт");
    expect(text.replace(/ /g, " ")).toContain("3 500 ₽ = 7 000 ₽");
    expect(text.replace(/ /g, " ")).toContain("Итого: 7 000 ₽");
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
    expect(text.replace(/ /g, " ")).toContain("Итого: 100 ₽ (без позиций, у которых нет цены)");
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
      seller: DEFAULT_SELLER_REQUISITES,
    });

    expect(text).not.toContain("Доставка");
    expect(text).not.toContain("БасКом");
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
