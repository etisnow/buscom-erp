import type { CustomerType } from "@/generated/prisma/enums";

/** Подписи типа клиента — одни и те же в списке, карточке и выгрузке. */
export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  PERSON: "Физлицо",
  COMPANY: "Юрлицо",
};
