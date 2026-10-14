"use client";

import { useRef, useState, useTransition, type ClipboardEvent, type DragEvent } from "react";
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { formatMoscowDateTime } from "@buscom/domain/datetime";
import {
  canDeleteOrderFile,
  fileExtension,
  fileFormat,
  isGalleryImage,
  MAX_ORDER_FILE_BYTES,
  type FileFormat,
} from "@buscom/domain/order/order-files";
import type { UserRole } from "@buscom/db/enums";
import { cn } from "@/lib/utils";
import { deleteOrderFileAction, uploadOrderFileAction } from "@/app/(app)/orders/[number]/actions";

export type OrderFileItem = {
  id: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  uploadedAt: Date;
  uploadedById: string | null;
  uploadedByName: string | null;
};

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

const fileHref = (id: string, thumb = false) => `/api/order-files/${id}${thumb ? "?size=thumb" : ""}`;

/** Плитка документа: цвет и значок по формату, крупно — расширение. */
const FORMAT_STYLE: Record<FileFormat, { icon: typeof File; className: string }> = {
  pdf: { icon: FileText, className: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300" },
  word: { icon: FileText, className: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" },
  sheet: {
    icon: FileSpreadsheet,
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  archive: { icon: FileArchive, className: "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300" },
  image: { icon: FileImage, className: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" },
  other: { icon: File, className: "bg-muted text-muted-foreground" },
};

/** Перетаскивают именно файлы, а не выделенный текст или ссылку со страницы. */
const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

/**
 * Галерея файлов заказа: любые файлы плитками. Фото — миниатюрой, по нажатию открываются
 * на весь экран и листаются; документы — плиткой формата, по нажатию скачиваются.
 * Файлы добавляются кнопкой, перетаскиванием на блок или вставкой (Ctrl+V), по одному
 * запросу на файл — так каждый укладывается в лимит размера запроса.
 */
export function OrderFiles({
  orderId,
  orderNumber,
  files,
  user,
}: {
  orderId: string;
  orderNumber: number;
  files: OrderFileItem[];
  user: { id: string; role: UserRole };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  /** «2 из 5» во время загрузки нескольких файлов */
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);
  const [toDelete, setToDelete] = useState<OrderFileItem | null>(null);

  const images = files.filter((file) => isGalleryImage(file.contentType));

  function upload(list: FileList | File[]) {
    const incoming = [...list];
    if (!incoming.length || pending) return;
    const tooBig = incoming.filter((file) => file.size > MAX_ORDER_FILE_BYTES);
    if (tooBig.length) {
      toast.error(
        `Больше ${MAX_ORDER_FILE_BYTES / 1024 / 1024} МБ, не загружены: ${tooBig.map((file) => file.name).join(", ")}`,
      );
    }
    const queue = incoming.filter((file) => file.size <= MAX_ORDER_FILE_BYTES);
    if (!queue.length) return;

    startTransition(async () => {
      let added = 0;
      for (const [index, file] of queue.entries()) {
        setProgress({ done: index, total: queue.length });
        const form = new FormData();
        form.set("file", file);
        const result = await uploadOrderFileAction(orderId, orderNumber, form);
        if (result.ok) added++;
        else toast.error(`«${file.name}»: ${result.error}`);
      }
      setProgress(null);
      if (added) toast.success(added === 1 ? "Файл добавлен" : `Добавлено файлов: ${added}`);
    });
  }

  function remove(file: OrderFileItem) {
    startTransition(async () => {
      const result = await deleteOrderFileAction(orderId, orderNumber, file.id);
      if (result.ok) toast.success("Файл удалён");
      else toast.error(result.error);
    });
  }

  return (
    <section
      tabIndex={0}
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 transition-colors outline-none",
        dragging && "border-primary bg-primary/5",
      )}
      // Скриншот или скопированный файл: блок в фокусе (щелчок по нему) → Ctrl+V
      onPaste={(event: ClipboardEvent<HTMLElement>) => {
        if (!event.clipboardData.files.length) return;
        event.preventDefault();
        upload(event.clipboardData.files);
      }}
      onDragOver={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = pending ? "none" : "copy";
        setDragging(true);
      }}
      onDragLeave={(event) => {
        // Уход на вложенный элемент — не выход из зоны.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        upload(event.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading font-medium">
          Файлы{files.length ? <span className="text-muted-foreground ml-1.5 font-normal">{files.length}</span> : null}
        </h2>
        {progress ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
            <Loader2 className="size-3.5 animate-spin" />
            Загрузка {progress.done + 1} из {progress.total}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs max-md:hidden">Перетащите файлы сюда или вставьте Ctrl+V</span>
        )}
      </div>

      <input
        ref={input}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) upload(event.target.files);
          event.target.value = "";
        }}
      />

      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6">
        {files.map((file) => {
          const image = isGalleryImage(file.contentType);
          const style = FORMAT_STYLE[fileFormat(file.fileName, file.contentType)];
          const Icon = style.icon;
          const extension = fileExtension(file.fileName);
          const details = [
            file.fileName,
            formatSize(file.byteSize),
            `${file.uploadedByName ?? "—"}, ${formatMoscowDateTime(file.uploadedAt)}`,
          ].join("\n");
          const tile = "flex aspect-square w-full overflow-hidden rounded-md border";

          return (
            <li key={file.id} className="group relative flex min-w-0 flex-col gap-1">
              {image ? (
                <button
                  type="button"
                  title={details}
                  className={cn(tile, "bg-muted")}
                  onClick={() => setViewing(images.findIndex((item) => item.id === file.id))}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- файл из нашего API за авторизацией, оптимизатор тут не нужен */}
                  <img
                    src={fileHref(file.id, true)}
                    alt={file.fileName}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                </button>
              ) : (
                <a
                  href={fileHref(file.id)}
                  download={file.fileName}
                  title={`${details}\nНажмите, чтобы скачать`}
                  className={cn(tile, "flex-col items-center justify-center gap-1", style.className)}
                >
                  <Icon className="size-7" />
                  <span className="text-sm font-semibold tracking-wide">{extension || "ФАЙЛ"}</span>
                </a>
              )}
              <span className="truncate text-xs" title={file.fileName}>
                {file.fileName}
              </span>
              <span className="text-muted-foreground -mt-1 text-[11px]">{formatSize(file.byteSize)}</span>

              {canDeleteOrderFile(file, user) ? (
                <Button
                  variant="secondary"
                  size="icon-xs"
                  aria-label={`Удалить ${file.fileName}`}
                  title="Удалить файл"
                  disabled={pending}
                  className="absolute top-1 right-1 opacity-0 shadow-sm group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                  onClick={() => setToDelete(file)}
                >
                  <X />
                </Button>
              ) : null}
            </li>
          );
        })}

        <li className="flex min-w-0 flex-col">
          <button
            type="button"
            disabled={pending}
            onClick={() => input.current?.click()}
            className="text-muted-foreground hover:border-primary hover:text-primary flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-6 animate-spin" /> : <Plus className="size-6" />}
            Добавить
          </button>
        </li>
      </ul>

      <ImageLightbox
        images={images.map((file) => ({ src: fileHref(file.id), alt: file.fileName, openHref: fileHref(file.id) }))}
        index={viewing}
        onIndexChange={setViewing}
      />

      <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить файл?</DialogTitle>
            <DialogDescription>
              «{toDelete?.fileName}» сотрётся из заказа без возможности вернуть. В истории заказа останется запись об
              удалении.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Отмена
              </Button>
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                const file = toDelete;
                setToDelete(null);
                if (file) remove(file);
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
