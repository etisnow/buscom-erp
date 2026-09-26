/**
 * Причины отмены заказа. По PRD это справочник, редактируемый администратором,
 * но таблицы справочников в схеме ещё нет — пока список здесь, в одном месте
 * (см. docs/STATUS.md, «Известные проблемы»).
 */
export const CANCEL_REASONS = [
  "Клиент передумал",
  "Нет в наличии",
  "Не устроила цена",
  "Не устроил срок поставки",
  "Дубль заказа",
  "Клиент не выходит на связь",
  "Другое",
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

export function isKnownCancelReason(value: string): value is CancelReason {
  return (CANCEL_REASONS as readonly string[]).includes(value);
}
