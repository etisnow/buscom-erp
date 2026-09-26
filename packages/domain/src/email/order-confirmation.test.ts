import { describe, expect, it } from "vitest";
import { orderConfirmationLetter, type ConfirmationOrder } from "./order-confirmation";

const contacts = {
  phone: "+7 (967) 712-45-00",
  email: "info@bus-com.ru",
  pickupAddress: "Нижний Новгород, ул. Корейская, 24",
  hours: "Пн–Пт 10:00–17:00",
};

const order: ConfirmationOrder = {
  number: 3050,
  customerName: "Иван",
  items: [
    {
      name: "Сиденье Антивандальное",
      sku: "S08",
      quantity: 2,
      priceKopecks: 567_000,
      options: [{ valueId: "v", optionName: "Ремень", valueName: "Двухточечный", priceDeltaKopecks: 70_000 }],
    },
    { name: "Клей для ткани 1 кг", sku: "PR16", quantity: 1, priceKopecks: 0, options: [] },
  ],
  totalKopecks: 1_134_000,
  deliveryMethod: "CARRIER",
  carrier: "СДЭК",
  deliveryAddress: "Казань",
};

describe("письмо покупателю о заказе", () => {
  it("номер, позиции с опциями и ценой, итог, доставка, что дальше", () => {
    const letter = orderConfirmationLetter(order, contacts);
    expect(letter.subject).toBe("Заказ № 3050 принят — Баском");
    expect(letter.body).toContain("Иван, здравствуйте!");
    expect(letter.body).toContain("• Сиденье Антивандальное (Ремень: Двухточечный), арт. S08 — 2 шт., 11");
    expect(letter.body).toContain("• Клей для ткани 1 кг, арт. PR16 — 1 шт., цена по запросу");
    expect(letter.body).toContain("(без товаров с ценой по запросу)");
    expect(letter.body).toContain("Доставка: СДЭК, Казань.");
    expect(letter.body).toContain("+7 (967) 712-45-00");
  });

  it("самовывоз — адрес склада и часы", () => {
    const letter = orderConfirmationLetter(
      { ...order, deliveryMethod: "PICKUP", items: order.items.slice(0, 1) },
      contacts,
    );
    expect(letter.body).toContain("Самовывоз со склада: Нижний Новгород, ул. Корейская, 24. Пн–Пт 10:00–17:00.");
    expect(letter.body).not.toContain("цена по запросу");
  });
});
