import { describe, expect, it } from "vitest";
import { customerName, declaredItemsTotal, parseSiteOrder } from "./contract";

/** Пример из PRD, «Контракт входящего заказа (v1)». */
const VALID = {
  externalId: "12345",
  createdAt: "2026-09-19T10:15:00+03:00",
  customer: {
    type: "PERSON",
    name: "Иван Петров",
    phone: "+7 912 345-67-89",
    email: "ivan@example.ru",
    inn: null,
    companyName: null,
  },
  items: [
    {
      externalProductId: "501",
      sku: "SID-2-GZL",
      name: "Сиденье двухместное для ГАЗели",
      priceKopecks: 1_250_000,
      quantity: 2,
    },
  ],
  delivery: { method: "CARRIER", carrier: "СДЭК", address: "г. Екатеринбург, …", priceKopecks: 0 },
  payment: { method: "INVOICE", paidKopecks: 0 },
  totalKopecks: 2_500_000,
  comment: "Перезвоните после 14:00",
};

describe("разбор заказа с сайта", () => {
  it("пример из PRD проходит", () => {
    const result = parseSiteOrder(VALID);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.externalId).toBe("12345");
      expect(result.order.items).toHaveLength(1);
      expect(result.order.delivery?.carrier).toBe("СДЭК");
    }
  });

  it("минимальный заказ без доставки и оплаты принимается", () => {
    const result = parseSiteOrder({
      externalId: "1",
      customer: { name: "Иван" },
      items: [{ name: "Поручень", priceKopecks: 100, quantity: 1 }],
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.order.customer.type).toBe("PERSON");
  });

  it("без externalId — ошибка", () => {
    const result = parseSiteOrder({ ...VALID, externalId: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("externalId");
  });

  it("пустой список позиций — ошибка", () => {
    const result = parseSiteOrder({ ...VALID, items: [] });
    expect(result.ok).toBe(false);
  });

  it("дробные копейки не принимаются", () => {
    const result = parseSiteOrder({
      ...VALID,
      items: [{ ...VALID.items[0], priceKopecks: 1250.5 }],
    });
    expect(result.ok).toBe(false);
  });

  it("отрицательная цена не принимается", () => {
    const result = parseSiteOrder({
      ...VALID,
      items: [{ ...VALID.items[0], priceKopecks: -1 }],
    });
    expect(result.ok).toBe(false);
  });

  it("нулевое количество не принимается", () => {
    const result = parseSiteOrder({
      ...VALID,
      items: [{ ...VALID.items[0], quantity: 0 }],
    });
    expect(result.ok).toBe(false);
  });

  it("неизвестный способ доставки не принимается", () => {
    const result = parseSiteOrder({ ...VALID, delivery: { method: "DRONE", priceKopecks: 0 } });
    expect(result.ok).toBe(false);
  });

  it("не-объект отклоняется без падения", () => {
    expect(parseSiteOrder(null).ok).toBe(false);
    expect(parseSiteOrder("строка").ok).toBe(false);
    expect(parseSiteOrder([]).ok).toBe(false);
  });

  it("лишние поля не ломают разбор", () => {
    const result = parseSiteOrder({ ...VALID, unknownField: "что-то новое" });
    expect(result.ok).toBe(true);
  });
});

describe("customerName", () => {
  it("у физлица берётся имя", () => {
    const result = parseSiteOrder(VALID);
    if (!result.ok) throw new Error("не разобралось");
    expect(customerName(result.order)).toBe("Иван Петров");
  });

  it("у юрлица предпочитается название компании", () => {
    const result = parseSiteOrder({
      ...VALID,
      customer: { ...VALID.customer, type: "COMPANY", companyName: "ООО «Автолайн»" },
    });
    if (!result.ok) throw new Error("не разобралось");
    expect(customerName(result.order)).toBe("ООО «Автолайн»");
  });

  it("у юрлица без названия компании берётся имя контакта", () => {
    const result = parseSiteOrder({
      ...VALID,
      customer: { ...VALID.customer, type: "COMPANY", companyName: "  " },
    });
    if (!result.ok) throw new Error("не разобралось");
    expect(customerName(result.order)).toBe("Иван Петров");
  });
});

describe("declaredItemsTotal", () => {
  it("считает сумму позиций по данным сайта", () => {
    const result = parseSiteOrder(VALID);
    if (!result.ok) throw new Error("не разобралось");
    expect(declaredItemsTotal(result.order)).toBe(2_500_000);
  });
});
