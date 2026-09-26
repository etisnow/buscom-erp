/**
 * Файлы самого заказа (`OrderDocument`), не поставщика: сейчас только
 * транспортная накладная в блоке «Доставка». Проверка содержимого и права —
 * те же, что у счёта поставщика (`packages/domain/src/order/supplier-document.ts`).
 */
import type { OrderStatus, UserRole } from "@buscom/db/enums";
import { canManageSupplierDocuments } from "./supplier-document";

export const ORDER_DOCUMENT_LABELS = {
  WAYBILL: "Транспортная накладная",
} as const;

export type OrderDocumentKind = keyof typeof ORDER_DOCUMENT_LABELS;

export function isOrderDocumentKind(value: string): value is OrderDocumentKind {
  return Object.hasOwn(ORDER_DOCUMENT_LABELS, value);
}

/** Прикреплять и убирать файлы заказа можно, пока он не в финальном статусе. */
export function canManageOrderDocuments(status: OrderStatus, role: UserRole): boolean {
  return canManageSupplierDocuments(status, role);
}
