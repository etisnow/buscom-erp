import { describe, expect, it } from "vitest";
import { parseLegacyCustomer, splitEmails, splitPhones } from "@/domain/customer/legacy-import";

describe("splitPhones", () => {
  it("берёт первый распознанный номер, остальные отдаёт списком", () => {
    expect(splitPhones("89062119993; факс (840153) 22054, тел. (840153) 22052")).toEqual({
      phone: "+79062119993",
      rest: ["(840153) 22054", "(840153) 22052"],
    });
  });

  it("номер в любом формате приводится к +7", () => {
    expect(splitPhones("8 (916) 123-45-67").phone).toBe("+79161234567");
    expect(splitPhones("79161234567").phone).toBe("+79161234567");
  });

  it("если ни один кусок не номер — вся ячейка уходит в остаток", () => {
    expect(splitPhones("звонить через секретаря")).toEqual({ phone: null, rest: ["звонить через секретаря"] });
  });

  it("пустая ячейка не даёт ни номера, ни остатка", () => {
    expect(splitPhones("")).toEqual({ phone: null, rest: [] });
  });
});

describe("splitEmails", () => {
  it("берёт первый адрес, остальные отдаёт списком", () => {
    expect(splitEmails("Buh@Mail.ru, sales@mail.ru")).toEqual({ email: "buh@mail.ru", rest: ["sales@mail.ru"] });
  });

  it("без собаки адресом не считает", () => {
    expect(splitEmails("нет почты")).toEqual({ email: null, rest: ["нет", "почты"] });
  });
});

describe("parseLegacyCustomer", () => {
  const company = {
    Вид: "Юр.лицо",
    ФИО: "Владимир Чижов",
    Название: "АО НПП АЛМАЗ",
    Адрес: "410033, Саратов, ул. Панфилова, 1",
    Телефон: "89062119993",
    "E-mail": "info@almaz.ru",
    "Контактное лицо": "Владимир Чижов",
    Примечание: "Возит на переоборудование",
    Тип: "Клиент",
    Статус: "Получена оплата",
    "Юридическое название": "АКЦИОНЕРНОЕ ОБЩЕСТВО НПП «АЛМАЗ»",
    ИНН: "645 123 4567",
    КПП: "645001001",
    ОГРН: "1026402000000",
  };

  it("у юрлица имя берётся из «Названия», а «ФИО» не подменяет его", () => {
    const parsed = parseLegacyCustomer(company);

    expect(parsed.type).toBe("COMPANY");
    expect(parsed.name).toBe("АО НПП АЛМАЗ");
    expect(parsed.contactPerson).toBe("Владимир Чижов");
  });

  it("у физлица имя берётся из «ФИО»", () => {
    const parsed = parseLegacyCustomer({ Вид: "Физ.лицо", ФИО: "Иванов Иван", Название: "Иванов Иван 31.05.2017" });

    expect(parsed.type).toBe("PERSON");
    expect(parsed.name).toBe("Иванов Иван");
  });

  it("ИНН и КПП очищаются от пробелов", () => {
    expect(parseLegacyCustomer(company).inn).toBe("6451234567");
  });

  it("реквизиты собираются в объект", () => {
    const parsed = parseLegacyCustomer(company);

    expect(parsed.requisites.legalName).toBe("АКЦИОНЕРНОЕ ОБЩЕСТВО НПП «АЛМАЗ»");
    expect(parsed.requisites.ogrn).toBe("1026402000000");
    expect(parsed.requisites.bic).toBe("");
  });

  it("воронка прежней CRM и лишние контакты уходят в комментарий", () => {
    const parsed = parseLegacyCustomer({
      ...company,
      Телефон: "89062119993, 89281112233",
      "E-mail": "info@almaz.ru sales@almaz.ru",
    });

    expect(parsed.comment).toBe(
      [
        "Возит на переоборудование",
        "Ещё телефоны: 89281112233",
        "Ещё email: sales@almaz.ru",
        "Из прежней ERP: Клиент / Получена оплата",
      ].join("\n"),
    );
  });

  it("ключ — телефон, а без телефона — ИНН", () => {
    expect(parseLegacyCustomer(company).key).toBe("+79062119993");
    expect(parseLegacyCustomer({ ...company, Телефон: "" }).key).toBe("inn:6451234567");
    expect(parseLegacyCustomer({ ...company, Телефон: "", ИНН: "" }).key).toBeNull();
  });

  it("паспорт собирается из отдельных колонок", () => {
    const parsed = parseLegacyCustomer({
      Вид: "Физ.лицо",
      ФИО: "Иванов Иван",
      "Серия паспорта": "7919",
      "Номер паспорта": "784571",
      "Дата выдачи": "12.07.2019",
      "Кем выдан": "МВД по Республике Адыгея",
    });

    expect(parsed.passport).toBe("7919 784571, выдан 12.07.2019, МВД по Республике Адыгея");
  });

  it("готовая строка идёт в дело без заполнителей прежней ERP", () => {
    const parsed = parseLegacyCustomer({
      Вид: "Физ.лицо",
      ФИО: "Иванов Иван",
      "Паспортные данные":
        "паспорт 0314 926746\nДата выдачи не указана\nКем выдан - не указаноАдрес прописки не указан",
    });

    expect(parsed.passport).toBe("паспорт 0314 926746");
  });

  it("текст заявки с сайта в «Адресе прописки» паспортом не считается", () => {
    const parsed = parseLegacyCustomer({
      Вид: "Физ.лицо",
      ФИО: "Иванов Иван",
      "Серия паспорта": "0314",
      "Номер паспорта": "926746",
      "Адрес прописки": "Вопрос / Комментарий: Интересуют шторки на мерседес спринтер",
    });

    expect(parsed.passport).toBe("0314 926746");
  });

  it("пустая строка выгрузки не падает и не выдумывает данных", () => {
    const parsed = parseLegacyCustomer({});

    expect(parsed).toMatchObject({ type: "PERSON", name: "", phone: null, email: null, comment: null, key: null });
  });
});
