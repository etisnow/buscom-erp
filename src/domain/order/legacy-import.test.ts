import { describe, expect, it } from "vitest";
import { parseLegacyDate, parseLegacyOrder } from "@/domain/order/legacy-import";

describe("parseLegacyDate", () => {
  it("читает дату и дату со временем как московские", () => {
    expect(parseLegacyDate("18.08.2026")?.toISOString()).toBe("2026-08-17T21:00:00.000Z");
    expect(parseLegacyDate("18.08.2026 12:19")?.toISOString()).toBe("2026-08-18T09:19:00.000Z");
  });

  it("мусор датой не считает", () => {
    expect(parseLegacyDate("")).toBeNull();
    expect(parseLegacyDate("не указана")).toBeNull();
  });
});

describe("parseLegacyOrder", () => {
  const row = {
    ID: "3241",
    Номер: "402",
    Дата: "18.08.2026",
    "Время добавления": "18.08.2026 12:19",
    "На кого": "ООО Норд-авто",
    "E-mail": "nordserv@list.ru",
    Описание: "Сиденье пассажира одноместное Соболь NN",
    Сумма: "22785,00",
    "Сумма к оплате": "22785,00",
    Оплачено: "22785,00",
    "Сумма НДС": "3797,50",
    "Сумма скидок": "0,00",
    "Дата п/п": "10.08.2026",
    "Транспортная компания": "СДЭК",
    "Кто добавил": "Бражник Дмитрий Вячеславович",
    "Статус отправки": "Получен",
  };

  it("суммы переводятся в копейки", () => {
    const parsed = parseLegacyOrder(row)!;

    expect(parsed.totalKopecks).toBe(2_278_500);
    expect(parsed.paidKopecks).toBe(2_278_500);
    expect(parsed.discountKopecks).toBe(0);
  });

  it("ключ — ID строки, а не номер: номера в источнике повторяются", () => {
    expect(parseLegacyOrder(row)!.externalId).toBe("3241");
  });

  it("транспортная компания — доставка ТК, «Самовывоз» — самовывоз", () => {
    expect(parseLegacyOrder(row)).toMatchObject({ deliveryMethod: "CARRIER", carrier: "СДЭК" });
    expect(parseLegacyOrder({ ...row, "Транспортная компания": "Самовывоз" })).toMatchObject({
      deliveryMethod: "PICKUP",
      carrier: null,
    });
    expect(parseLegacyOrder({ ...row, "Транспортная компания": "" })).toMatchObject({
      deliveryMethod: null,
      carrier: null,
    });
  });

  it("переплата не переносится: оплачено не больше итога", () => {
    const parsed = parseLegacyOrder({ ...row, Оплачено: "30000,00" })!;

    expect(parsed.paidKopecks).toBe(2_278_500);
  });

  it("в заметку попадает то, чему нет места в полях заказа", () => {
    const { note } = parseLegacyOrder(row)!;

    expect(note).toContain("ID 3241");
    expect(note).toContain("Номер там: 402");
    expect(note).toContain("Бражник Дмитрий Вячеславович");
    expect(note).toContain("НДС");
  });

  it("пустое описание заменяется, чтобы позиция не осталась без названия", () => {
    expect(parseLegacyOrder({ ...row, Описание: "" })!.itemName).toBe("Заказ из прежней ERP");
  });

  it("строка без ID или без даты пропускается", () => {
    expect(parseLegacyOrder({ ...row, ID: "" })).toBeNull();
    expect(parseLegacyOrder({ ...row, Дата: "", "Время добавления": "" })).toBeNull();
  });

  it("email берётся первый и приводится к нижнему регистру", () => {
    expect(parseLegacyOrder({ ...row, "E-mail": "Buh@Mail.ru, sales@mail.ru" })!.customerEmail).toBe("buh@mail.ru");
    expect(parseLegacyOrder({ ...row, "E-mail": "нет почты" })!.customerEmail).toBeNull();
  });
});
