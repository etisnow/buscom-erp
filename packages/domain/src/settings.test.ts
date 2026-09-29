import { describe, expect, it } from "vitest";
import {
  DEFAULT_CARRIER_SETTINGS,
  mergeCarrierSettings,
  mergePecSettings,
  mergeServiceSettings,
  DEFAULT_SERVICE_SETTINGS,
  DEFAULT_SELLER_REQUISITES,
  DEFAULT_SETTINGS,
  DEFAULT_IMAP_SETTINGS,
  DEFAULT_SMTP_SETTINGS,
  imapConfigured,
  imapSettingsSchema,
  mergeImapSettings,
  type ImapSettings,
  mergeSmtpSettings,
  parseSetting,
  requisitesReady,
  smtpConfigured,
  smtpSettingsSchema,
  type SmtpSettings,
} from "./settings";
import { WORKING_MINUTES_PER_DAY } from "./sla";

describe("parseSetting: лимит скидки", () => {
  it("принимает корректный процент", () => {
    expect(parseSetting("discountLimitPercent", 15)).toBe(15);
  });

  it("ноль — допустимое значение, скидки запрещены", () => {
    expect(parseSetting("discountLimitPercent", 0)).toBe(0);
  });

  it("мусор откатывается к умолчанию, а не роняет систему", () => {
    expect(parseSetting("discountLimitPercent", "много")).toBe(DEFAULT_SETTINGS.discountLimitPercent);
    expect(parseSetting("discountLimitPercent", -5)).toBe(DEFAULT_SETTINGS.discountLimitPercent);
    expect(parseSetting("discountLimitPercent", 120)).toBe(DEFAULT_SETTINGS.discountLimitPercent);
    expect(parseSetting("discountLimitPercent", null)).toBe(DEFAULT_SETTINGS.discountLimitPercent);
  });
});

describe("parseSetting: SLA", () => {
  it("частичная настройка дополняется умолчаниями", () => {
    const result = parseSetting("slaMinutes", { NEW: 15 });
    expect(result.NEW).toBe(15);
    expect(result.IN_PROGRESS).toBe(WORKING_MINUTES_PER_DAY);
    expect(result.COMPLETED).toBeNull();
  });

  it("null означает «срок не контролируется»", () => {
    const result = parseSetting("slaMinutes", { NEW: null });
    expect(result.NEW).toBeNull();
  });

  it("неизвестный статус делает значение негодным целиком", () => {
    const result = parseSetting("slaMinutes", { НЕТ_ТАКОГО: 10 });
    expect(result).toEqual(DEFAULT_SETTINGS.slaMinutes);
  });

  it("ноль и дробные минуты не принимаются", () => {
    expect(parseSetting("slaMinutes", { NEW: 0 })).toEqual(DEFAULT_SETTINGS.slaMinutes);
    expect(parseSetting("slaMinutes", { NEW: 10.5 })).toEqual(DEFAULT_SETTINGS.slaMinutes);
  });
});

describe("parseSetting: реквизиты продавца", () => {
  it("недостающие поля заполняются пустыми строками", () => {
    const result = parseSetting("sellerRequisites", { name: "ООО «Баском»", inn: "6671234567" });
    expect(result.name).toBe("ООО «Баском»");
    expect(result.bankAccount).toBe("");
  });

  it("мусор откатывается к пустым реквизитам", () => {
    expect(parseSetting("sellerRequisites", "строка")).toEqual(DEFAULT_SELLER_REQUISITES);
  });
});

describe("requisitesReady", () => {
  it("пустые реквизиты не готовы для счёта", () => {
    expect(requisitesReady(DEFAULT_SELLER_REQUISITES)).toBe(false);
  });

  it("нужны название, ИНН и расчётный счёт", () => {
    expect(requisitesReady({ ...DEFAULT_SELLER_REQUISITES, name: "ООО «Баском»", inn: "6671234567" })).toBe(false);
    expect(
      requisitesReady({
        ...DEFAULT_SELLER_REQUISITES,
        name: "ООО «Баском»",
        inn: "6671234567",
        bankAccount: "40702810000000000001",
      }),
    ).toBe(true);
  });

  it("пробелы не считаются заполненным полем", () => {
    expect(requisitesReady({ ...DEFAULT_SELLER_REQUISITES, name: "   ", inn: "  ", bankAccount: " " })).toBe(false);
  });
});

const FILLED_SMTP: SmtpSettings = {
  host: "smtp.yandex.ru",
  port: 465,
  secure: true,
  user: "noreply@bus-com.ru",
  password: "секрет",
  from: "BusCom ERP <noreply@bus-com.ru>",
};

describe("smtpSettingsSchema", () => {
  it("порт приходит из формы строкой и приводится к числу", () => {
    const parsed = smtpSettingsSchema.parse({ host: "smtp.test", port: "465", secure: true });

    expect(parsed.port).toBe(465);
  });

  it("подставляет умолчания для незаполненного", () => {
    const parsed = smtpSettingsSchema.parse({ host: "smtp.test" });

    expect(parsed).toEqual({ ...DEFAULT_SMTP_SETTINGS, host: "smtp.test" });
  });

  it("обрезает пробелы в хосте и адресе — из буфера обмена они приходят часто", () => {
    const parsed = smtpSettingsSchema.parse({ host: "  smtp.test  ", user: " user@test.ru " });

    expect(parsed.host).toBe("smtp.test");
    expect(parsed.user).toBe("user@test.ru");
  });

  it("отклоняет порт вне диапазона", () => {
    expect(smtpSettingsSchema.safeParse({ host: "smtp.test", port: 0 }).success).toBe(false);
    expect(smtpSettingsSchema.safeParse({ host: "smtp.test", port: 70000 }).success).toBe(false);
  });
});

describe("smtpConfigured", () => {
  it("решает один хост", () => {
    expect(smtpConfigured(FILLED_SMTP)).toBe(true);
    expect(smtpConfigured(DEFAULT_SMTP_SETTINGS)).toBe(false);
  });

  it("хост из одних пробелов настройкой не считается", () => {
    expect(smtpConfigured(smtpSettingsSchema.parse({ host: "   " }))).toBe(false);
  });
});

describe("mergeSmtpSettings", () => {
  it("пустой пароль из формы оставляет сохранённый", () => {
    const merged = mergeSmtpSettings(FILLED_SMTP, { ...FILLED_SMTP, password: "", port: 587 });

    expect(merged.password).toBe("секрет");
    expect(merged.port).toBe(587);
  });

  it("непустой пароль заменяет сохранённый", () => {
    const merged = mergeSmtpSettings(FILLED_SMTP, { ...FILLED_SMTP, password: "новый" });

    expect(merged.password).toBe("новый");
  });

  it("остальные поля берутся из формы целиком", () => {
    const merged = mergeSmtpSettings(FILLED_SMTP, { ...DEFAULT_SMTP_SETTINGS, password: "" });

    expect(merged.host).toBe("");
    expect(merged.user).toBe("");
  });
});

describe("parseSetting для smtp", () => {
  it("читает сохранённое значение", () => {
    expect(parseSetting("smtp", FILLED_SMTP)).toEqual(FILLED_SMTP);
  });

  it("негодное значение откатывает к умолчанию, а не роняет систему", () => {
    expect(parseSetting("smtp", { host: 42 })).toEqual(DEFAULT_SMTP_SETTINGS);
    expect(parseSetting("smtp", null)).toEqual(DEFAULT_SMTP_SETTINGS);
  });
});

describe("IMAP", () => {
  const FILLED_IMAP: ImapSettings = { host: "mail.jino.ru", port: 993, user: "info@bus-com.ru", password: "секрет" };

  it("ящик настроен, только когда есть сервер, логин и пароль", () => {
    expect(imapConfigured(FILLED_IMAP)).toBe(true);
    expect(imapConfigured({ ...FILLED_IMAP, password: "" })).toBe(false);
    expect(imapConfigured(DEFAULT_IMAP_SETTINGS)).toBe(false);
  });

  it("пустой пароль из формы оставляет сохранённый, новый — заменяет", () => {
    expect(mergeImapSettings(FILLED_IMAP, { ...FILLED_IMAP, host: "imap.yandex.ru", password: "" })).toEqual({
      ...FILLED_IMAP,
      host: "imap.yandex.ru",
    });
    expect(mergeImapSettings(FILLED_IMAP, { ...FILLED_IMAP, password: "новый" }).password).toBe("новый");
  });

  it("порт по умолчанию 993, негодное значение из БД — умолчания", () => {
    expect(imapSettingsSchema.parse({ host: "h" }).port).toBe(993);
    expect(parseSetting("imap", { port: "abc" })).toEqual(DEFAULT_IMAP_SETTINGS);
  });
});

describe("ключи API транспортных компаний", () => {
  const saved = { dellinAppKey: "ключ-1", yandexMapsApiKey: "карты-1", pecLogin: "buscom", pecApiKey: "пэк-1" };

  it("пустое поле ключа ДЛ оставляет сохранённый, новый — заменяет; ключ карт форма ДЛ не трогает", () => {
    expect(mergeCarrierSettings(saved, { dellinAppKey: "" })).toEqual(saved);
    expect(mergeCarrierSettings(saved, { dellinAppKey: "ключ-2" })).toEqual({ ...saved, dellinAppKey: "ключ-2" });
  });

  it("пробелы обрезаются, старое значение без новых ключей читается", () => {
    expect(parseSetting("carriers", { dellinAppKey: "  ключ-3 " })).toEqual({
      dellinAppKey: "ключ-3",
      yandexMapsApiKey: "",
      pecLogin: "",
      pecApiKey: "",
    });
  });

  it("ПЭК: логин меняется как есть, пустой ключ оставляет сохранённый; остальное не трогается", () => {
    expect(mergePecSettings(saved, { pecLogin: "новый", pecApiKey: "" })).toEqual({ ...saved, pecLogin: "новый" });
    expect(mergePecSettings(saved, { pecLogin: "buscom", pecApiKey: "пэк-2" })).toEqual({
      ...saved,
      pecApiKey: "пэк-2",
    });
  });

  it("негодное значение из БД — умолчания, по умолчанию ключей нет", () => {
    expect(parseSetting("carriers", "мусор")).toEqual(DEFAULT_CARRIER_SETTINGS);
    expect(DEFAULT_SETTINGS.carriers).toEqual({ dellinAppKey: "", yandexMapsApiKey: "", pecLogin: "", pecApiKey: "" });
  });
});

describe("ключи внешних сервисов", () => {
  it("пустое поле ключа оставляет сохранённый, новый — заменяет; ключи не мешают друг другу", () => {
    const saved = { dewatermarkApiKey: "dw-1", photoroomApiKey: "pr-1" };
    expect(mergeServiceSettings(saved, { dewatermarkApiKey: "", photoroomApiKey: "" })).toEqual(saved);
    expect(mergeServiceSettings(saved, { dewatermarkApiKey: "dw-2", photoroomApiKey: "" })).toEqual({
      dewatermarkApiKey: "dw-2",
      photoroomApiKey: "pr-1",
    });
    expect(mergeServiceSettings(saved, { dewatermarkApiKey: "", photoroomApiKey: "pr-2" })).toEqual({
      dewatermarkApiKey: "dw-1",
      photoroomApiKey: "pr-2",
    });
  });

  it("пробелы обрезаются; негодное значение из БД — умолчания, по умолчанию ключей нет", () => {
    expect(parseSetting("services", { dewatermarkApiKey: "  dw-3 ", photoroomApiKey: " pr-3 " })).toEqual({
      dewatermarkApiKey: "dw-3",
      photoroomApiKey: "pr-3",
    });
    // Настройка, сохранённая до появления ключа Photoroom, читается с пустым ключом
    expect(parseSetting("services", { dewatermarkApiKey: "dw-4" })).toEqual({
      dewatermarkApiKey: "dw-4",
      photoroomApiKey: "",
    });
    expect(parseSetting("services", "мусор")).toEqual(DEFAULT_SERVICE_SETTINGS);
    expect(DEFAULT_SETTINGS.services).toEqual({ dewatermarkApiKey: "", photoroomApiKey: "" });
  });
});
