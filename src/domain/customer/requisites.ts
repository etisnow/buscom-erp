import { z } from "zod";

/**
 * Реквизиты юрлица-покупателя. Лежат в `Customer.requisites` (Json) одним объектом:
 * колонок под них в схеме нет — заполнены они у меньшинства клиентов, а состав
 * пришёл из выгрузки прежней ERP (docs/STATUS.md, «Выгрузка клиентов»).
 *
 * В счёт не печатаются: там реквизиты продавца из настроек, а от покупателя —
 * название, ИНН и КПП. Эти нужны для договоров и справок.
 */
export const customerRequisitesSchema = z.object({
  /** Полное название по уставу — отличается от рабочего `Customer.name` */
  legalName: z.string(),
  legalAddress: z.string(),
  ogrn: z.string(),
  bankName: z.string(),
  bic: z.string(),
  bankAccount: z.string(),
  correspondentAccount: z.string(),
  /** Должность и ФИО — в выгрузке они записаны одной строкой */
  signerName: z.string(),
  accountantName: z.string(),
});

export type CustomerRequisites = z.infer<typeof customerRequisitesSchema>;

export const EMPTY_CUSTOMER_REQUISITES: CustomerRequisites = {
  legalName: "",
  legalAddress: "",
  ogrn: "",
  bankName: "",
  bic: "",
  bankAccount: "",
  correspondentAccount: "",
  signerName: "",
  accountantName: "",
};

/** Подписи полей — одни и те же в карточке и в форме заведения. */
export const CUSTOMER_REQUISITES_LABELS: Record<keyof CustomerRequisites, string> = {
  legalName: "Юридическое название",
  legalAddress: "Юридический адрес",
  ogrn: "ОГРН",
  bankName: "Банк",
  bic: "БИК",
  bankAccount: "Расчётный счёт",
  correspondentAccount: "Корреспондентский счёт",
  signerName: "Руководитель",
  accountantName: "Бухгалтер",
};

/**
 * Разбор того, что лежит в Json-поле. Старые записи и записи из импорта могут
 * не иметь части ключей, поэтому недостающие добиваем пустыми строками, а не
 * отбрасываем объект целиком.
 */
export function parseCustomerRequisites(value: unknown): CustomerRequisites {
  if (!value || typeof value !== "object") return EMPTY_CUSTOMER_REQUISITES;

  const source = value as Record<string, unknown>;
  const result = { ...EMPTY_CUSTOMER_REQUISITES };
  for (const key of Object.keys(EMPTY_CUSTOMER_REQUISITES) as (keyof CustomerRequisites)[]) {
    if (typeof source[key] === "string") result[key] = source[key];
  }
  return result;
}

/** Пустые реквизиты в базе не храним: незачем отличать «пусто» от «не заполняли». */
export function hasCustomerRequisites(requisites: CustomerRequisites): boolean {
  return Object.values(requisites).some((value) => value.trim() !== "");
}
