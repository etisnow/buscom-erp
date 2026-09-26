"use client";

import { DocumentUpload, type DocumentView } from "@/components/orders/document-upload";
import { deleteSupplierDocumentAction, uploadSupplierDocumentAction } from "@/app/(app)/orders/[number]/actions";

export type SupplierDocumentView = DocumentView;

/**
 * Загрузчик артефакта по поставщику (счёт и т.п.) — виден в заказе, только
 * когда у поставщика включено соответствующее действие
 * (`packages/domain/src/supplier/actions.ts`, раздел «Действия и артефакты» в его карточке).
 */
export function SupplierDocumentUpload({
  orderId,
  orderNumber,
  supplierId,
  kind,
  label,
  document,
  editable,
}: {
  orderId: string;
  orderNumber: number;
  supplierId: string;
  kind: string;
  label: string;
  document: SupplierDocumentView;
  editable: boolean;
}) {
  return (
    <DocumentUpload
      label={label}
      document={document}
      href={(id) => `/api/order-supplier-documents/${id}`}
      editable={editable}
      upload={(form) => uploadSupplierDocumentAction(orderId, orderNumber, supplierId, kind, form)}
      remove={() => deleteSupplierDocumentAction(orderId, orderNumber, supplierId, kind)}
    />
  );
}
