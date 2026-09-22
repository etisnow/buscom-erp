"use client";

import { useRef, useTransition } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { deleteSupplierDocumentAction, uploadSupplierDocumentAction } from "@/app/(app)/orders/[number]/actions";

export type SupplierDocumentView = { id: string; fileName: string; byteSize: number } | null;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/**
 * Загрузчик артефакта по поставщику (счёт и т.п.) — виден в заказе, только
 * когда у поставщика включено соответствующее действие
 * (`src/domain/supplier/actions.ts`, раздел «Действия и артефакты» в его карточке).
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
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const result = await uploadSupplierDocumentAction(orderId, orderNumber, supplierId, kind, form);
      if (result.ok) toast.success("Файл прикреплён");
      else toast.error(result.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteSupplierDocumentAction(orderId, orderNumber, supplierId, kind);
      if (result.ok) toast.success("Файл удалён");
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) upload(file);
          event.target.value = "";
        }}
      />

      {document ? (
        <a
          href={`/api/order-supplier-documents/${document.id}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:underline"
        >
          <FileText className="size-4 shrink-0" />
          <span className="max-w-48 truncate">{document.fileName}</span>
          <span className="text-muted-foreground text-xs whitespace-nowrap">{formatSize(document.byteSize)}</span>
        </a>
      ) : null}

      {editable ? (
        <>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => input.current?.click()}
            title={`Загрузить: ${label}`}
          >
            <Upload />
            {document ? "Заменить" : label}
          </Button>
          {document ? (
            <Button
              variant="destructive"
              size="icon"
              className="size-8"
              aria-label="Убрать файл"
              disabled={pending}
              onClick={remove}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
