import type { CustomerType } from "@buscom/db/enums";

/** Подписи типа клиента — одни и те же в списке, карточке и выгрузке. */
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  PERSON: "Физлицо",
  COMPANY: "Юрлицо",
};
