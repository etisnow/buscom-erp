import { describe, expect, it } from "vitest";
import {
  applyCompanyInfo,
  checkInn,
  companyStatusWarning,
  parseDadataParty,
  type CompanyInfo,
} from "@/domain/customer/company-lookup";
import { EMPTY_CUSTOMER_REQUISITES } from "@/domain/customer/requisites";

describe("checkInn", () => {
  it("принимает верные ИНН юрлица и ИП", () => {
    expect(checkInn("7707083893")).toEqual({ ok: true, inn: "7707083893" });
    expect(checkInn("500100732259")).toEqual({ ok: true, inn: "500100732259" });
  });

  it("убирает пробелы — так ИНН записаны в части старых данных", () => {
    expect(checkInn(" 770 708 3893 ")).toEqual({ ok: true, inn: "7707083893" });
  });

  it("ловит опечатку по контрольной цифре", () => {
    expect(checkInn("7707083894").ok).toBe(false);
    expect(checkInn("500100732258").ok).toBe(false);
  });

  it("отклоняет пустое, буквы и неверную длину", () => {
    expect(checkInn("")).toEqual({ ok: false, error: "Сначала впишите ИНН" });
    expect(checkInn("77070838ab").ok).toBe(false);
    expect(checkInn("77070838").ok).toBe(false);
  });
});

/** Сокращённый ответ `findById/party` — только поля, которые разбираем. */
function response(data: Record<string, unknown>, value = "ПАО СБЕРБАНК") {
  return { suggestions: [{ value, data }] };
}

describe("parseDadataParty", () => {
  it("разбирает юрлицо", () => {
    const info = parseDadataParty(
      response({
        inn: "7707083893",
        kpp: "773601001",
        ogrn: "1027700132195",
        type: "LEGAL",
        name: { full_with_opf: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"', short_with_opf: "ПАО СБЕРБАНК" },
        management: { name: "Греф Герман Оскарович", post: "ПРЕЗИДЕНТ, ПРЕДСЕДАТЕЛЬ ПРАВЛЕНИЯ" },
        address: {
          value: "г Москва, ул Вавилова, д 19",
          unrestricted_value: "117312, г Москва, Академический р-н, ул Вавилова, д 19",
        },
        state: { status: "ACTIVE" },
      }),
    );

    expect(info).toEqual({
      inn: "7707083893",
      name: "ПАО СБЕРБАНК",
      kpp: "773601001",
      legalName: 'ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "СБЕРБАНК РОССИИ"',
      legalAddress: "117312, г Москва, Академический р-н, ул Вавилова, д 19",
      ogrn: "1027700132195",
      signerName: "Президент, председатель правления Греф Герман Оскарович",
      status: "ACTIVE",
    });
  });

  it("у ИП подписант — сам предприниматель, КПП нет", () => {
    const info = parseDadataParty(
      response(
        {
          inn: "500100732259",
          kpp: null,
          ogrn: "304500116000157",
          type: "INDIVIDUAL",
          name: {
            full_with_opf: "Индивидуальный предприниматель Иванов Иван Иванович",
            short_with_opf: "ИП Иванов И И",
          },
          fio: { surname: "Иванов", name: "Иван", patronymic: "Иванович" },
          management: null,
          address: { value: "г Москва", unrestricted_value: null },
          state: { status: "ACTIVE" },
        },
        "ИП Иванов Иван Иванович",
      ),
    );

    expect(info?.kpp).toBe("");
    expect(info?.name).toBe("ИП Иванов И И");
    expect(info?.signerName).toBe("Индивидуальный предприниматель Иванов Иван Иванович");
    expect(info?.legalAddress).toBe("г Москва");
  });

  it("неизвестный статус и отсутствующие блоки не ломают разбор", () => {
    const info = parseDadataParty(response({ inn: "7707083893", state: { status: "SOMETHING_NEW" } }));
    expect(info?.status).toBe("UNKNOWN");
    expect(info?.name).toBe("ПАО СБЕРБАНК");
    expect(info?.signerName).toBe("");
  });

  it("не нашли — null", () => {
    expect(parseDadataParty({ suggestions: [] })).toBeNull();
    expect(parseDadataParty({})).toBeNull();
    expect(parseDadataParty(null)).toBeNull();
    expect(parseDadataParty({ suggestions: [{ nodata: true }] })).toBeNull();
  });
});

describe("companyStatusWarning", () => {
  it("молчит о действующей и предупреждает об остальных", () => {
    expect(companyStatusWarning("ACTIVE")).toBeNull();
    expect(companyStatusWarning("UNKNOWN")).toBeNull();
    expect(companyStatusWarning("LIQUIDATED")).toBe("Организация ликвидирована");
    expect(companyStatusWarning("BANKRUPT")).toBe("Организация признана банкротом");
  });
});

describe("applyCompanyInfo", () => {
  const info: CompanyInfo = {
    inn: "7707083893",
    name: "ПАО СБЕРБАНК",
    kpp: "773601001",
    legalName: "ПАО «Сбербанк России»",
    legalAddress: "117312, г Москва, ул Вавилова, д 19",
    ogrn: "1027700132195",
    signerName: "Президент Греф Герман Оскарович",
    status: "ACTIVE",
  };

  it("заполняет пустую форму целиком", () => {
    const result = applyCompanyInfo({ name: "", kpp: "", requisites: EMPTY_CUSTOMER_REQUISITES }, info);
    expect(result.name).toBe("ПАО СБЕРБАНК");
    expect(result.kpp).toBe("773601001");
    expect(result.requisites.ogrn).toBe("1027700132195");
    expect(result.requisites.signerName).toBe("Президент Греф Герман Оскарович");
  });

  it("рабочее название не трогает, официальные данные обновляет", () => {
    const result = applyCompanyInfo(
      {
        name: "Сбер (бухгалтерия)",
        kpp: "000000000",
        requisites: { ...EMPTY_CUSTOMER_REQUISITES, legalAddress: "старый адрес" },
      },
      info,
    );
    expect(result.name).toBe("Сбер (бухгалтерия)");
    expect(result.kpp).toBe("773601001");
    expect(result.requisites.legalAddress).toBe("117312, г Москва, ул Вавилова, д 19");
  });

  it("банк не трогает, пустое из выписки ничего не затирает", () => {
    const result = applyCompanyInfo(
      {
        name: "ИП Иванов",
        kpp: "123456789",
        requisites: { ...EMPTY_CUSTOMER_REQUISITES, bic: "044525225", bankAccount: "40702810" },
      },
      { ...info, kpp: "", signerName: "" },
    );
    expect(result.kpp).toBe("123456789");
    expect(result.requisites.bic).toBe("044525225");
    expect(result.requisites.bankAccount).toBe("40702810");
    expect(result.requisites.signerName).toBe("");
  });
});
