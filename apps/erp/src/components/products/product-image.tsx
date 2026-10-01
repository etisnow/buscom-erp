"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { Download, Eraser, ImageMinus, ImageOff, ImageUp, Star, Trash2, Undo2, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  deleteProductImageAction,
  importProductImagesAction,
  makeProductImageMainAction,
  processProductImageAction,
  restoreProductImageAction,
  uploadProductImagesAction,
} from "@/app/(app)/products/actions";

/**
 * Картинки отдаёт наш маршрут за авторизацией, поэтому оптимизатор Next не
 * нужен (`unoptimized`): он ходил бы за картинкой без cookie сессии. Размер
 * превью и так готовый — 228×228 у главной картинки с сайта, 74×74 у остальных.
 */
export function imageUrl(imageId: string, size: "thumb" | "full" = "full"): string {
  return `/api/product-images/${imageId}${size === "thumb" ? "?size=thumb" : ""}`;
}

/** Аватарка товара в списках; без картинки — нейтральная заглушка того же размера. */
export function ProductThumb({ imageId, name, size = 40 }: { imageId: string | null; name: string; size?: number }) {
  if (!imageId) {
    return (
      <span
        className="bg-muted text-muted-foreground flex shrink-0 items-center justify-center rounded-md"
        style={{ width: size, height: size }}
        aria-label="Нет картинки"
      >
        <ImageOff className="size-4" />
      </span>
    );
  }
  return (
    <Image
      src={imageUrl(imageId, "thumb")}
      alt={name}
      width={size}
      height={size}
      unoptimized
      className="shrink-0 rounded-md border object-cover"
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Галерея товара в карточке: все картинки в порядке показа, первая — аватарка
 * (её видно в списках и в позициях заказа). Можно добавить свои, назначить
 * главную и удалить лишние. Щелчок по картинке открывает полный размер.
 */
export function ProductGalleryEditor({
  productId,
  images,
  name,
  supplierUrls = [],
}: {
  productId: string;
  /** `originalContentType` есть — картинку обрабатывали, оригинал можно вернуть */
  images: { id: string; originalContentType?: string | null }[];
  name: string;
  /** Ссылки на товар у поставщиков — подсказка для «Импортировать с сайта поставщика» */
  supplierUrls?: string[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [viewing, setViewing] = useState<number | null>(null);

  function upload(files: File[]) {
    startTransition(async () => {
      // По файлу за раз: лимит тела Server Action — 16 МБ (next.config.ts), пачка бы его перебрала.
      let saved = 0;
      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        const result = await uploadProductImagesAction(productId, form);
        if (result.ok) saved += 1;
        else toast.error(`${file.name}: ${result.error}`);
      }
      if (saved > 0) toast.success(saved === 1 ? "Картинка сохранена" : `Сохранено картинок: ${saved}`);
    });
  }

  function act(action: () => Promise<{ ok: true; message: string } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  const [importing, setImporting] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  /** Снимки со страницы поставщика качаются, пока не придёт ответ — до нескольких десятков секунд */
  function importFromSupplier() {
    startTransition(async () => {
      const result = await importProductImagesAction(productId, importUrl);
      if (result.ok) {
        toast.success(result.message);
        setImporting(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  /** Обработка идёт у внешнего сервиса до минуты: пока ждём, картинка помечена, а не «зависла» */
  const [processingId, setProcessingId] = useState<string | null>(null);
  function process(imageId: string, operation: "watermark" | "background") {
    setProcessingId(imageId);
    startTransition(async () => {
      const result = await processProductImageAction(imageId, operation);
      setProcessingId(null);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <ImageLightbox
        images={images.map((image, index) => ({
          src: imageUrl(image.id),
          alt: index === 0 ? name : `${name} — картинка ${index + 1}`,
          openHref: imageUrl(image.id),
        }))}
        index={viewing}
        onIndexChange={setViewing}
      />
      {/* Картинок у сиденья бывает и сорок пять — ряд прокручивается, чтобы поля товара не уезжали вниз */}
      <div className={cn("flex max-h-56 flex-wrap items-start gap-2 overflow-y-auto", pending && "opacity-50")}>
        {images.map((image, index) => (
          <div key={image.id} className="group relative">
            <button type="button" onClick={() => setViewing(index)} title="Открыть на весь экран" className="block">
              <Image
                src={imageUrl(image.id, "thumb")}
                alt={index === 0 ? name : `${name} — картинка ${index + 1}`}
                width={96}
                height={96}
                unoptimized
                className={cn("size-24 rounded-md border object-cover", index === 0 && "border-primary border-2")}
              />
            </button>
            {index === 0 ? (
              <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1 text-[10px] leading-4">
                Главная
              </span>
            ) : null}
            {image.originalContentType ? (
              <span
                className="bg-background/90 absolute top-1 right-1 rounded px-1 text-[10px] leading-4"
                title="Картинка обработана, оригинал можно вернуть"
              >
                обработана
              </span>
            ) : null}
            {processingId === image.id ? (
              <span className="bg-background/70 absolute inset-0 flex items-center justify-center rounded-md text-xs font-medium">
                Обрабатываю…
              </span>
            ) : null}
            {/* Кнопки поверх картинки: в ряду из нескольких картинок им негде встать рядом */}
            <div className="absolute right-1 bottom-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {index === 0 ? null : (
                <Button
                  variant="outline"
                  size="icon-xs"
                  title="Сделать главной"
                  disabled={pending}
                  onClick={() => act(() => makeProductImageMainAction(image.id))}
                >
                  <Star />
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon-xs" title="Убрать знак или фон" disabled={pending}>
                    <WandSparkles />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => process(image.id, "watermark")}>
                    <Eraser />
                    Удалить водяной знак
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => process(image.id, "background")}>
                    <ImageMinus />
                    Удалить фон
                  </DropdownMenuItem>
                  {image.originalContentType ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => act(() => restoreProductImageAction(image.id))}>
                        <Undo2 />
                        Вернуть оригинал
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="destructive"
                size="icon-xs"
                title="Удалить картинку"
                disabled={pending}
                onClick={() => act(() => deleteProductImageAction(image.id))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}

        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            if (files.length > 0) upload(files);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => input.current?.click()}
          title="Добавить картинки"
          className="text-muted-foreground hover:border-primary hover:text-primary flex size-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-xs"
        >
          <ImageUp className="size-5" />
          Добавить
        </button>
      </div>
      {importing ? (
        <div className="flex min-w-0 items-center gap-2">
          <Input
            type="url"
            inputMode="url"
            list={`supplier-urls-${productId}`}
            placeholder="Ссылка на товар на сайте поставщика"
            value={importUrl}
            onChange={(event) => setImportUrl(event.target.value)}
            className="h-8 min-w-0"
          />
          <datalist id={`supplier-urls-${productId}`}>
            {supplierUrls.map((url) => (
              <option key={url} value={url} />
            ))}
          </datalist>
          <Button type="button" size="sm" disabled={pending || !importUrl.trim()} onClick={importFromSupplier}>
            {pending ? "Импортирую…" : "Импортировать"}
          </Button>
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setImporting(false)}>
            Отмена
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          disabled={pending}
          onClick={() => {
            setImportUrl(supplierUrls[0] ?? "");
            setImporting(true);
          }}
        >
          <Download />
          Импортировать с сайта поставщика
        </Button>
      )}
      <span className="text-muted-foreground text-xs">
        {images.length === 0
          ? "Картинок нет. JPEG, PNG, WebP или GIF до 5 МБ"
          : "Первая картинка — главная, её видно в списках. JPEG, PNG, WebP или GIF до 5 МБ"}
      </span>
    </div>
  );
}
