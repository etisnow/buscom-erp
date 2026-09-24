import { describe, expect, it } from "vitest";
import { formatRub } from "@/domain/money";
import {
  normalizeEmailAddress,
  orderNumberFromSubject,
  parseAddressList,
  referencedMessageIds,
  replySubject,
  suggestedTemplates,
} from "./letters";
import {
  DEFAULT_EMAIL_TEMPLATES,
  parseEmailTemplates,
  renderEmailTemplate,
  renderTemplate,
  templateVariables,
} from "./templates";

describe("адреса", () => {
  it("адрес из «Имя <адрес>» в нижнем регистре", () => {
    expect(normalizeEmailAddress("Иван Петров <Ivan@Mail.RU>")).toBe("ivan@mail.ru");
    expect(normalizeEmailAddress(" a@b.ru ")).toBe("a@b.ru");
    expect(normalizeEmailAddress("не адрес")).toBeNull();
    expect(normalizeEmailAddress(null)).toBeNull();
  });

  it("список адресов: дубли убираются, негодные отдельно", () => {
    expect(parseAddressList("a@b.ru; A@B.ru, c@d.ru, ошибка")).toEqual({
      valid: ["a@b.ru", "c@d.ru"],
      invalid: ["ошибка"],
    });
  });
});

describe("orderNumberFromSubject", () => {
  it("находит номер после «№» и после «заказ»", () => {
    expect(orderNumberFromSubject("Re: Ваш заказ №3016 оплачен")).toBe(3016);
    expect(orderNumberFromSubject("RE: Счёт на оплату заказа № 42")).toBe(42);
    expect(orderNumberFromSubject("по заказу 3017, вопрос")).toBe(3017);
  });

  it("просто число в теме — не номер заказа", () => {
    expect(orderNumberFromSubject("Сиденье 2026 года, артикул 3016")).toBeNull();
    expect(orderNumberFromSubject("Вопрос")).toBeNull();
  });
});

describe("цепочка писем", () => {
  it("Message-ID из References и In-Reply-To без скобок и дублей", () => {
    expect(referencedMessageIds("<a@x> <b@x>", ["<b@x>", "c@x"], null)).toEqual(["a@x", "b@x", "c@x"]);
  });

  it("тема ответа — «Re:» один раз", () => {
    expect(replySubject("Re: RE: Fwd: Заказ №1")).toBe("Re: Заказ №1");
    expect(replySubject("Вопрос")).toBe("Re: Вопрос");
  });
});

describe("suggestedTemplates", () => {
  const order = { totalKopecks: 1000, paidKopecks: 1000, trackingNumber: "TR-1", customerEmail: "a@b.ru" };

  it("полная оплата — «оплачен», трек — «отправлен»", () => {
    expect(suggestedTemplates(order, [])).toEqual(["paid", "shipped"]);
  });

  it("уже отправленное не предлагается, частичная оплата — не повод", () => {
    expect(suggestedTemplates(order, ["paid"])).toEqual(["shipped"]);
    expect(suggestedTemplates({ ...order, paidKopecks: 500, trackingNumber: null }, [])).toEqual([]);
  });

  it("без email клиента подсказок нет", () => {
    expect(suggestedTemplates({ ...order, customerEmail: null }, [])).toEqual([]);
  });
});

describe("шаблоны", () => {
  const variables = templateVariables(
    {
      number: 3016,
      customerName: "ООО Ромашка",
      totalKopecks: 2_772_000,
      paidKopecks: 2_772_000,
      carrier: "СДЭК",
      trackingNumber: null,
      deliveryAddress: "Москва",
      shippedAt: new Date("2026-09-23T10:00:00Z"),
    },
    { name: "ИП Иванов", phone: "" },
  );

  it("подставляет значения, строки с пустыми подстановками выбрасывает", () => {
    const letter = renderEmailTemplate(DEFAULT_EMAIL_TEMPLATES.shipped, variables);
    expect(letter.subject).toBe("Ваш заказ №3016 отправлен");
    expect(letter.body).toContain("Заказ №3016 отправлен 23.09.2026.");
    expect(letter.body).toContain("Транспортная компания: СДЭК");
    expect(letter.body).not.toContain("Трек-номер");
    expect(letter.body.endsWith("С уважением,\nИП Иванов")).toBe(true);
  });

  it("неизвестная подстановка остаётся как есть", () => {
    expect(renderTemplate("Сумма {сумма}, {опечатка}", variables)).toBe(`Сумма ${formatRub(2_772_000)}, {опечатка}`);
  });

  it("негодный шаблон из БД заменяется умолчанием, годные остаются", () => {
    const parsed = parseEmailTemplates({ paid: { subject: "Оплачено", body: "Спасибо" }, shipped: { subject: "" } });
    expect(parsed.paid).toEqual({ subject: "Оплачено", body: "Спасибо" });
    expect(parsed.shipped).toEqual(DEFAULT_EMAIL_TEMPLATES.shipped);
  });
});
