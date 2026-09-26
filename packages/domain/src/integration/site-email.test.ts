import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isSiteOrderEmail,
  parseRubles,
  parseSiteEmail,
  readCompany,
  readDelivery,
  siteEmailOrderNumber,
  type SiteEmail,
} from "./site-email";

// Настоящие письма сайта (OpenCart, order_alert) с заменёнными персональными данными
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

const person: SiteEmail = {
  subject: "Баском. Комплектующие для микроавтобусов - Заказ 2819",
  html: fixture("opencart-person.html"),
  text: fixture("opencart-person.txt"),
  date: "2026-09-23T12:17:09.000Z",
};

const company: SiteEmail = {
  subject: "Баском. Комплектующие для микроавтобусов - Заказ 2820",
  html: fixture("opencart-company.html"),
  text: fixture("opencart-company.txt"),
  date: "2026-09-23T12:19:29.000Z",
};

const cell = (content: string, attrs = "") => `<td style="font-size: 12px;"${attrs}>${content}</td>`;

/** Письмо физлица с другим набором строк товаров и итогов — шаблон тот же. */
function withItems(itemRows: string, totalRows: string): SiteEmail {
  const html = person.html
    .replace(/<tbody>\s*<tr>\s*<td[^>]*>\s*Профиль[\s\S]*?<\/tbody>/, `<tbody>${itemRows}</tbody>`)
    .replace(/<tfoot>[\s\S]*?<\/tfoot>/, `<tfoot>${totalRows}</tfoot>`);
  return { ...person, html };
}

const itemRow = (name: string, model: string, quantity: number, price: string) =>
  `<tr>${cell(name)}${cell(model)}${cell(String(quantity))}${cell(price)}${cell(price)}</tr>`;
const totalRow = (label: string, amount: string) =>
  `<tr>${cell(`<b>${label}:</b>`, ' colspan="4"')}${cell(amount)}</tr>`;

describe("письмо о заказе с сайта", () => {
  it("узнаёт письмо о заказе и достаёт номер", () => {
    expect(isSiteOrderEmail(person)).toBe(true);
    expect(siteEmailOrderNumber(person)).toBe("2819");
    expect(isSiteOrderEmail({ subject: "Re: вопрос по доставке", html: "", text: "Здравствуйте" })).toBe(false);
  });

  it("номер берётся из тела, если тема без номера", () => {
    expect(siteEmailOrderNumber({ ...person, subject: "Новый заказ" })).toBe("2819");
  });

  it("физлицо: клиент, позиция по артикулу, доставка ТК, итог", () => {
    const result = parseSiteEmail(person);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const { order, paymentMethod } = result.value;

    expect(order.externalId).toBe("2819");
    expect(order.createdAt).toBe("2026-09-23T12:17:09.000Z");
    expect(order.customer).toEqual({
      type: "PERSON",
      name: "test",
      phone: "+79120000001",
      email: "ivan@example.ru",
      inn: null,
      kpp: null,
      companyName: null,
    });
    expect(order.items).toEqual([
      { sku: "OS12", name: "Профиль светодиодный на подиум микроавтобуса", quantity: 1, priceKopecks: 750_000 },
    ]);
    expect(order.delivery).toEqual({ method: "CARRIER", carrier: "СДЭК", address: "Нижний Новгород", priceKopecks: 0 });
    expect(order.totalKopecks).toBe(750_000);
    expect(order.comment).toBeNull();
    expect(paymentMethod).toBe("Сбербанк-Онлайн");
  });

  it("юрлицо: ИНН и название из реквизитов в комментарии, комментарий целиком", () => {
    const result = parseSiteEmail(company);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    const { order, paymentMethod } = result.value;

    expect(order.customer).toMatchObject({
      type: "COMPANY",
      name: "Тестовый Тестович Тест",
      inn: "7700000009",
      kpp: "770001001",
      companyName: "ООО «РОМАШКА-АВТО»",
    });
    expect(order.items).toEqual([
      { sku: "P06", name: "Полки для микроавтобуса Турист", quantity: 1, priceKopecks: 2_700_000 },
    ]);
    expect(order.delivery).toMatchObject({
      method: "CARRIER",
      carrier: "Деловые линии",
      address: "Москва, ул. Прибрежная д. 1, Нижний Новгород",
    });
    expect(order.comment).toMatch(/^Реквизиты: ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ/);
    expect(order.comment).toContain("БИК: 044500001");
    expect(paymentMethod).toBe("Выставить счет");
  });

  it("несколько позиций, опции товара, доставка и скидка в итогах", () => {
    const email = withItems(
      itemRow(
        "Сиденье пассажирское<br />&nbsp;<small> - Цвет: чёрный</small><br />&nbsp;<small> - Ремень: да</small>",
        "ST121",
        2,
        "12 500 руб.",
      ) + itemRow("Поручень &quot;Стандарт&quot;", "PR10", 3, "1 200,50 руб."),
      totalRow("Подитог", "28 601,50 руб.") +
        totalRow('ТК "СДЭК"', "900 руб.") +
        totalRow("Купон (SALE)", "-500 руб.") +
        totalRow("Итого", "29 001,50 руб."),
    );

    const result = parseSiteEmail(email);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.value.order.items).toEqual([
      { sku: "ST121", name: "Сиденье пассажирское (Цвет: чёрный; Ремень: да)", quantity: 2, priceKopecks: 1_250_000 },
      { sku: "PR10", name: 'Поручень "Стандарт"', quantity: 3, priceKopecks: 120_050 },
    ]);
    // Скидка не вычитается из доставки: расхождение с «Итого» ERP покажет в журнале заказа
    expect(result.value.order.delivery?.priceKopecks).toBe(90_000);
    expect(result.value.order.totalKopecks).toBe(2_900_150);
  });

  it("письмо без таблицы товаров — ошибка с понятным текстом, а не исключение", () => {
    const broken = { ...person, html: person.html.replace(/Модель/g, "Артикул") };
    expect(parseSiteEmail(broken)).toEqual({ ok: false, error: "В письме не найдена таблица товаров" });
  });

  it("письмо без HTML-версии — ошибка", () => {
    const result = parseSiteEmail({ ...person, html: "" });
    expect(result).toEqual({ ok: false, error: "В письме нет HTML-версии с таблицами заказа" });
  });

  it("без даты письма заказ получает время приёма", () => {
    const result = parseSiteEmail({ ...person, date: null });
    expect(result.ok && result.value.order.createdAt).toBeUndefined();
  });
});

describe("parseRubles", () => {
  it.each([
    ["27 000 руб.", 2_700_000],
    ["7 500,50 руб.", 750_050],
    ["7500.5 руб.", 750_050],
    ["-500 руб.", -50_000],
    ["0 руб.", 0],
  ])("%s → %d коп.", (input, expected) => {
    expect(parseRubles(input)).toBe(expected);
  });

  it("без цифр — null", () => {
    expect(parseRubles("бесплатно")).toBeNull();
  });
});

describe("readDelivery", () => {
  it.each([
    ['ТК "СДЭК"', { method: "CARRIER", carrier: "СДЭК" }],
    ["ТК «Деловые линии»", { method: "CARRIER", carrier: "Деловые линии" }],
    ["Самовывоз из магазина", { method: "PICKUP", carrier: null }],
    ["Курьером по Нижнему Новгороду", { method: "COURIER", carrier: null }],
    ["Почта России", { method: "CARRIER", carrier: "Почта России" }],
  ])("%s", (label, expected) => {
    expect(readDelivery(label)).toEqual(expected);
  });

  it("нет способа доставки — пусто", () => {
    expect(readDelivery(null)).toEqual({ method: null, carrier: null });
  });
});

describe("readCompany", () => {
  it("ИП с 12-значным ИНН, форма сокращается", () => {
    expect(readCompany("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ Иванов И. И., ИНН 770000000082")).toEqual({
      inn: "770000000082",
      kpp: null,
      name: "ИП Иванов И. И.",
    });
  });

  it("ИНН без названия — юрлицо без названия", () => {
    expect(readCompany("ИНН: 7700000009, счёт на почту")).toEqual({ inn: "7700000009", kpp: null, name: null });
  });

  it("КПП берётся рядом с ИНН — по нему выбирается филиал", () => {
    expect(readCompany("ООО «Ромашка», ИНН/КПП 7700000009 / 770001001")).toMatchObject({
      inn: "7700000009",
      kpp: "770001001",
    });
  });

  it("ИНН с неверной контрольной цифрой — не юрлицо: скорее опечатка или чужое число", () => {
    expect(readCompany("ИНН 7700000001")).toBeNull();
  });

  it("комментарий без ИНН — не юрлицо", () => {
    expect(readCompany("Перезвоните после 14:00")).toBeNull();
    expect(readCompany(null)).toBeNull();
  });

  it("11 цифр подряд — не ИНН (это телефон)", () => {
    expect(readCompany("ИНН уточню, звоните 79120000001")).toBeNull();
  });
});
