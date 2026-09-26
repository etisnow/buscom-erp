"use client";

import { useRef, useState, useTransition, type DragEvent } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/app/(app)/orders/[number]/actions";

export type DocumentView = { id: string; fileName: string; byteSize: number } | null;

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** Перетаскивают именно файлы, а не выделенный текст или ссылку со страницы. */
const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

/**
 * Один прикреплённый к заказу файл (PDF или фото): ссылка на него, «Загрузить» /
 * «Заменить» и «Убрать». Файл можно и перетащить на блок — зона сброса та же
 * кнопка. Где лежит файл и какое действие его меняет — решает обёртка: счёт
 * поставщика, транспортная накладная.
 */
export function DocumentUpload({
  label,
  document,
  href,
  editable,
  upload,
  remove,
}: {
  label: string;
  document: DocumentView;
  /** Адрес файла по его id */
  href: (id: string) => string;
  editable: boolean;
  upload: (form: FormData) => Promise<ActionResult>;
  remove: () => Promise<ActionResult>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  function send(file: File) {
    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const result = await upload(form);
      if (result.ok) toast.success("Файл прикреплён");
      else toast.error(result.error);
    });
  }

  function discard() {
    startTransition(async () => {
      const result = await remove();
      if (result.ok) toast.success("Файл удалён");
      else toast.error(result.error);
    });
  }

  const dropHandlers = editable
    ? {
        onDragOver: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = pending ? "none" : "copy";
          setDragging(true);
        },
        onDragLeave: (event: DragEvent<HTMLDivElement>) => {
          // Уход на вложенный элемент — не выход из зоны.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        },
        onDrop: (event: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(event)) return;
          event.preventDefault();
          setDragging(false);
          if (pending) return;
          const files = event.dataTransfer.files;
          if (files.length > 1) toast.info("Прикрепляется один файл — взят первый");
          if (files[0]) send(files[0]);
        },
      }
    : {};

  return (
    <div
      {...dropHandlers}
      className={cn(
        "flex flex-wrap items-center gap-2 text-sm",
        editable && "rounded-md border border-dashed p-2 transition-colors",
        dragging && "border-primary bg-primary/5",
      )}
    >
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) send(file);
          event.target.value = "";
        }}
      />

      {document ? (
        <a
          href={href(document.id)}
          target="_blank"
          rel="noopener"
          className="bg-background inline-flex items-center gap-1.5 rounded-md border px-2 py-1 hover:underline"
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
              onClick={discard}
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
          <span className="text-muted-foreground text-xs">
            {pending ? "Загружается…" : dragging ? "Отпустите, чтобы прикрепить" : "или перетащите файл сюда"}
          </span>
        </>
      ) : null}
    </div>
  );
}
