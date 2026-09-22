/**
 * Данные юрлица по ИНН — для кнопки «Заполнить» в форме клиента.
 *
 * Источник — DaData (`findById/party`, выписка ЕГРЮЛ/ЕГРИП). Здесь только чистая
 * часть: проверка ИНН, разбор ответа и перенос найденного в поля формы. Сеть —
 * в `src/server/customers/company-lookup.ts`.
 *
 * Банковских реквизитов в ЕГРЮЛ нет, поэтому банк, БИК и счета не трогаем:
 * их по-прежнему вписывают руками из карточки предприятия.
 */
import { z } from "zod";
import type { CustomerRequisites } from "@/domain/customer/requisites";

export type InnCheck = { ok: true; inn: string } | { ok: false; error: string };

const INN10_WEIGHTS = [2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_WEIGHTS_11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
const INN12_WEIGHTS_12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];

function checkDigit(digits: number[], weights: number[]): number {
  const sum = weights.reduce((total, weight, index) => total + weight * digits[index], 0);
  return (sum % 11) % 10;
}

/**
 * ИНН без пробелов и с верной контрольной суммой. Пробелы внутри встречаются
 * в старых данных («662 304 9453»), их молча убираем. Контрольная сумма ловит
 * опечатку до похода в сеть: DaData на неверный ИНН ответит просто «не найдено».
 */
export function checkInn(raw: string): InnCheck {
  const inn = raw.replace(/[\s-]/g, "");
  if (inn === "") return { ok: false, error: "Сначала впишите ИНН" };
  if (!/^\d+$/.test(inn)) return { ok: false, error: "ИНН состоит только из цифр" };
  if (inn.length !== 10 && inn.length !== 12) {
    return { ok: false, error: "ИНН юрлица — 10 цифр, ИП — 12" };
  }

  const digits = [...inn].map(Number);
  const valid =
    inn.length === 10
      ? checkDigit(digits, INN10_WEIGHTS) === digits[9]
      : checkDigit(digits, INN12_WEIGHTS_11) === digits[10] && checkDigit(digits, INN12_WEIGHTS_12) === digits[11];

  return valid ? { ok: true, inn } : { ok: false, error: "В ИНН опечатка: не сходится контрольная цифра" };
}

/** Состояние организации в ЕГРЮЛ. Всё, кроме ACTIVE, — повод предупредить менеджера. */
export type CompanyStatus = "ACTIVE" | "LIQUIDATING" | "LIQUIDATED" | "BANKRUPT" | "REORGANIZING" | "UNKNOWN";

export type CompanyInfo = {
  inn: string;
  /** Краткое название с формой собственности — годится в рабочее «Имя или название» */
  name: string;
  kpp: string;
  legalName: string;
  legalAddress: string;
  ogrn: string;
  /** Должность и ФИО одной строкой, как в `CustomerRequisites.signerName` */
  signerName: string;
  status: CompanyStatus;
};

/**
 * Ответ DaData. Схема мягкая: разбираем только нужное, а любое поле может
 * прийти `null` — у ИП нет КПП и руководителя, у свежих записей нет адреса.
 */
const text = z.string().nullish();
const partySchema = z.object({
  value: text,
  data: z.object({
    inn: text,
    kpp: text,
    ogrn: text,
    type: text,
    name: z.object({ full_with_opf: text, short_with_opf: text }).nullish(),
    fio: z.object({ surname: text, name: text, patronymic: text }).nullish(),
    management: z.object({ name: text, post: text }).nullish(),
    address: z.object({ value: text, unrestricted_value: text }).nullish(),
    state: z.object({ status: text }).nullish(),
  }),
});
const responseSchema = z.object({ suggestions: z.array(z.unknown()) });

const STATUSES: CompanyStatus[] = ["ACTIVE", "LIQUIDATING", "LIQUIDATED", "BANKRUPT", "REORGANIZING"];

/** «ГЕНЕРАЛЬНЫЙ ДИРЕКТОР» → «Генеральный директор»: в ЕГРЮЛ должности капсом. */
function sentenceCase(value: string): string {
  const lower = value.trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function join(...parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Первая организация из ответа `findById/party`. Пустой список или ответ
 * не той формы — `null`: вызывающий скажет «не найдено», а не упадёт.
 */
export function parseDadataParty(json: unknown): CompanyInfo | null {
  const response = responseSchema.safeParse(json);
  if (!response.success || response.data.suggestions.length === 0) return null;

  const party = partySchema.safeParse(response.data.suggestions[0]);
  if (!party.success) return null;

  const { data } = party.data;
  const isIndividual = data.type === "INDIVIDUAL";
  const status = STATUSES.find((item) => item === data.state?.status) ?? "UNKNOWN";

  // У ИП руководителя в выписке нет — подписывает сам предприниматель
  const signerName = isIndividual
    ? join("Индивидуальный предприниматель", data.fio?.surname, data.fio?.name, data.fio?.patronymic)
    : join(data.management?.post ? sentenceCase(data.management.post) : "", data.management?.name);

  return {
    inn: data.inn?.trim() ?? "",
    name: (data.name?.short_with_opf ?? party.data.value ?? "").trim(),
    kpp: data.kpp?.trim() ?? "",
    legalName: (data.name?.full_with_opf ?? "").trim(),
    // С индексом: для договоров адрес нужен полным
    legalAddress: (data.address?.unrestricted_value ?? data.address?.value ?? "").trim(),
    ogrn: data.ogrn?.trim() ?? "",
    signerName,
    status,
  };
}

/** Предупреждение для менеджера: с ликвидированной фирмой сделку лучше не заводить. */
export function companyStatusWarning(status: CompanyStatus): string | null {
  switch (status) {
    case "ACTIVE":
    case "UNKNOWN":
      return null;
    case "LIQUIDATING":
      return "Организация в процессе ликвидации";
    case "LIQUIDATED":
      return "Организация ликвидирована";
    case "BANKRUPT":
      return "Организация признана банкротом";
    case "REORGANIZING":
      return "Организация в процессе реорганизации";
  }
}

export type CompanyFields = { name: string; kpp: string; requisites: CustomerRequisites };

/**
 * Переносит найденное в поля формы. Официальные данные (КПП, полное название,
 * адрес, ОГРН, руководитель) заменяют введённое — за этим кнопку и нажимают.
 * Рабочее название заполняется, только если пустое: менеджер мог назвать
 * клиента по-своему. Пустое из выписки ничего не затирает. Банк не трогаем.
 */
export function applyCompanyInfo(current: CompanyFields, info: CompanyInfo): CompanyFields {
  const pick = (found: string, existing: string) => (found !== "" ? found : existing);

  return {
    name: current.name.trim() !== "" ? current.name : info.name,
    kpp: pick(info.kpp, current.kpp),
    requisites: {
      ...current.requisites,
      legalName: pick(info.legalName, current.requisites.legalName),
      legalAddress: pick(info.legalAddress, current.requisites.legalAddress),
      ogrn: pick(info.ogrn, current.requisites.ogrn),
      signerName: pick(info.signerName, current.requisites.signerName),
    },
  };
}
