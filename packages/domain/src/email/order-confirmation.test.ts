import { describe, expect, it } from "vitest";
import {
  formatCardNumber,
  orderConfirmationLetter,
  type ConfirmationContacts,
  type ConfirmationOrder,
} from "./order-confirmation";

const contacts: ConfirmationContacts = {
  phone: "+7 (967) 712-45-00",
  phoneHref: "tel:+79677124500",
  email: "info@bus-com.ru",
  pickupAddress: "Нижний Новгород, ул. Корейская, 24",
  hours: "Пн–Пт 10:00–17:00",
  siteUrl: "https://bus-com.ru",
  card: { bank: "Сбербанк", number: "4276420038523139", holder: "Иван Иванович И." },
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
      url: "https://bus-com.ru/sidene",
      imageUrl: "https://bus-com.ru/img/abc?size=thumb",
    },
    { name: "Клей для ткани 1 кг", sku: "PR16", quantity: 1, priceKopecks: 0, options: [], url: null, imageUrl: null },
  ],
  totalKopecks: 1_134_000,
  deliveryMethod: "CARRIER",
  carrier: "СДЭК",
  deliveryAddress: "Казань",
  payment: "CARD",
};

const oneItem: ConfirmationOrder = { ...order, items: order.items.slice(0, 1) };

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
    const letter = orderConfirmationLetter({ ...oneItem, deliveryMethod: "PICKUP" }, contacts);
    expect(letter.body).toContain("Самовывоз со склада: Нижний Новгород, ул. Корейская, 24. Пн–Пт 10:00–17:00.");
    expect(letter.body).not.toContain("цена по запросу");
    expect(letter.html).toContain("Самовывоз со склада");
  });

  it("частному лицу — перевод на карту с суммой и номером заказа", () => {
    const letter = orderConfirmationLetter(oneItem, contacts);
    expect(letter.body).toContain("Оплата — Сбербанк Онлайн:");
    expect(letter.body).toContain("на карту 4276 4200 3852 3139, получатель: Иван Иванович И.");
    expect(letter.html).toContain("4276 4200 3852 3139");
    expect(letter.html).toContain("ОПЛАТА · СБЕРБАНК ОНЛАЙН");
    expect(letter.html).toContain("11&nbsp;340&nbsp;₽");
    expect(letter.html).not.toContain("Подготовим счёт");
  });

  it("с товаром «цена по запросу» сумму перевода называет менеджер", () => {
    const letter = orderConfirmationLetter(order, contacts);
    expect(letter.body).toContain("Переведите сумму, которую подтвердит менеджер, на карту");
  });

  it("юрлицу — счёт на почту, без карты", () => {
    const letter = orderConfirmationLetter({ ...oneItem, payment: "INVOICE" }, contacts);
    expect(letter.body).toContain("Подготовим счёт на оплату и пришлем Вам на эту почту");
    expect(letter.html).toContain("Подготовим счёт на оплату и пришлем Вам на эту почту");
    expect(letter.html).not.toContain("4276");
  });

  it("карта не заполнена — реквизиты пришлёт менеджер", () => {
    const letter = orderConfirmationLetter(oneItem, { ...contacts, card: null });
    expect(letter.body).toContain("реквизиты для перевода пришлёт менеджер");
    expect(letter.html).toContain("Реквизиты для перевода пришлёт менеджер");
  });

  it("HTML: снимок и ссылка на товар, логотип с сайта, данные экранированы", () => {
    const letter = orderConfirmationLetter({ ...oneItem, customerName: "<b>Иван</b>" }, contacts);
    expect(letter.html).toContain('src="https://bus-com.ru/img/abc?size=thumb"');
    expect(letter.html).toContain('href="https://bus-com.ru/sidene"');
    expect(letter.html).toContain('src="https://bus-com.ru/mail/logo-bus.png"');
    expect(letter.html).toContain("&lt;b&gt;Иван&lt;/b&gt;, здравствуйте!");
    expect(letter.html).not.toContain("<b>Иван</b>");
  });

  it("номер карты — группами по 4 цифры", () => {
    expect(formatCardNumber("4276-4200 38523139")).toBe("4276 4200 3852 3139");
  });
});
