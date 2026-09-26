import { normalizePhone } from "./phone";
import { EMPTY_CUSTOMER_REQUISITES, type CustomerRequisites } from "./requisites";
import type { CustomerType } from "@buscom/db/enums";

/**
 * Разбор строки выгрузки клиентов из прежней ERP. Чистая функция: файл читает и в
 * базу пишет серверный слой. Решения по составу полей — `docs/STATUS.md`,
 * «Выгрузка клиентов из прежней ERP».
 *
 * Данные там заполняли руками много лет, поэтому правила простые и терпимые:
 * ничего не отбрасываем молча — что не легло в поле, уходит в комментарий.
 */

export type LegacyCustomer = {
  type: CustomerType;
  name: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  kpp: string | null;
  contactPerson: string | null;
  passport: string | null;
  requisites: CustomerRequisites;
  comment: string | null;
  address: string | null;
  /** Чем ищем уже заведённого клиента при повторном прогоне: телефон, иначе ИНН. */
  key: string | null;
};

const COMPANY = "Юр.лицо";

/**
 * Куски, похожие на номер: в ячейке бывает «факс (840153) 22054, тел. (840153) 22052».
 * Кусок может начинаться со скобки или плюса — код города пишут и так.
 */
function phoneCandidates(raw: string): string[] {
  return raw.match(/[\d(+][\d()\-\s+]{5,}/g) ?? [];
}

/**
 * Первый распознанный номер — рабочий, остальные уходят в комментарий: в ERP у
 * клиента один телефон, и именно по нему ловится дубль.
 */
export function splitPhones(raw: string): { phone: string | null; rest: string[] } {
  const candidates = phoneCandidates(raw);
  const normalized = candidates.map((item) => ({ raw: item.trim(), phone: normalizePhone(item) }));
  const firstIndex = normalized.findIndex((item) => item.phone !== null);

  if (firstIndex === -1) {
    // Ни один кусок не похож на российский номер — вся ячейка идёт в комментарий.
    const text = raw.trim();
    return { phone: null, rest: text ? [text] : [] };
  }

  return {
    phone: normalized[firstIndex]!.phone,
    rest: normalized.filter((_, index) => index !== firstIndex).map((item) => item.raw),
  };
}

/** Первый email — рабочий, остальные в комментарий. Разделителей в выгрузке много. */
export function splitEmails(raw: string): { email: string | null; rest: string[] } {
  const parts = raw
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const firstIndex = parts.findIndex((item) => item.includes("@"));

  if (firstIndex === -1) return { email: null, rest: parts };

  return {
    email: parts[firstIndex]!.toLowerCase(),
    rest: parts.filter((_, index) => index !== firstIndex),
  };
}

/** ИНН в выгрузке встречается с пробелами: «662 304 9453». */
function digitsOnly(raw: string): string | null {
  const digits = raw.replace(/\s/g, "");
  return digits || null;
}

/** «Дата выдачи не указана», «Кем выдан - не указано» — заполнители прежней ERP, не данные. */
const PASSPORT_FILLER = /(Дата выдачи не указана|Кем выдан\s*-\s*не указано|Адрес прописки не указан)/gi;

/**
 * Паспорт одной строкой. Собираем из отдельных колонок выгрузки; готовая строка
 * «Паспортные данные» идёт в дело, только если частей нет — в ней заполнители
 * слиплись с данными. Колонку `Паспорт` понимаем на случай уже подготовленного файла.
 */
function passportFrom(row: Record<string, string>): string | null {
  if (row["Паспорт"]?.trim()) return row["Паспорт"].trim();

  const registration = (row["Адрес прописки"] ?? "").trim();
  const parts = [
    [row["Серия паспорта"], row["Номер паспорта"]]
      .map((part) => (part ?? "").trim())
      .filter(Boolean)
      .join(" "),
    row["Дата выдачи"]?.trim() ? `выдан ${row["Дата выдачи"].trim()}` : "",
    row["Кем выдан"]?.trim() ?? "",
    // В «Адрес прописки» местами попал текст заявки с сайта — это не адрес.
    registration && !registration.includes("Вопрос") ? `прописка: ${registration}` : "",
  ].filter(Boolean);

  if (parts.length) return parts.join(", ");

  const ready = (row["Паспортные данные"] ?? "").replace(PASSPORT_FILLER, "").replace(/\s+/g, " ").trim();
  return ready.replace(/^[,\s]+|[,\s]+$/g, "") || null;
}

function requisitesFrom(row: Record<string, string>): CustomerRequisites {
  return {
    ...EMPTY_CUSTOMER_REQUISITES,
    legalName: row["Юридическое название"] ?? "",
    legalAddress: row["Юридический адрес"] ?? "",
    ogrn: row["ОГРН"] ?? "",
    bankName: row["Банк"] ?? "",
    bic: row["БИК"] ?? "",
    bankAccount: row["Расчетный счет"] ?? "",
    correspondentAccount: row["Корр. счет"] ?? "",
    signerName: row["Руководитель"] ?? "",
    accountantName: row["Бухгалтер"] ?? "",
  };
}

export function parseLegacyCustomer(row: Record<string, string>): LegacyCustomer {
  const isCompany = (row["Вид"] ?? "").trim() === COMPANY;
  // Имя: у физлица ФИО, у юрлица название. В выгрузке эти колонки совпадают у
  // 4304 строк из 4424, а там, где расходятся, у юрлиц в «ФИО» лежит имя контакта.
  const name = ((isCompany ? row["Название"] : row["ФИО"]) ?? "").trim();

  const { phone, rest: extraPhones } = splitPhones(row["Телефон"] ?? "");
  const { email, rest: extraEmails } = splitEmails(row["E-mail"] ?? "");
  const inn = digitsOnly(row["ИНН"] ?? "");

  const notes = [
    row["Примечание"]?.trim(),
    extraPhones.length ? `Ещё телефоны: ${extraPhones.join(", ")}` : "",
    extraEmails.length ? `Ещё email: ${extraEmails.join(", ")}` : "",
    // Воронка прежней CRM: отдельных полей в схеме не заводим (docs/DECISIONS.md).
    [row["Тип"]?.trim(), row["Статус"]?.trim()].filter(Boolean).length
      ? `Из прежней ERP: ${[row["Тип"]?.trim(), row["Статус"]?.trim()].filter(Boolean).join(" / ")}`
      : "",
  ].filter((part): part is string => Boolean(part));

  return {
    type: isCompany ? "COMPANY" : "PERSON",
    name,
    phone,
    email,
    inn,
    kpp: digitsOnly(row["КПП"] ?? ""),
    contactPerson: row["Контактное лицо"]?.trim() || null,
    passport: passportFrom(row),
    requisites: requisitesFrom(row),
    comment: notes.join("\n") || null,
    address: row["Адрес"]?.trim() || null,
    key: phone ?? (inn ? `inn:${inn}` : null),
  };
}
