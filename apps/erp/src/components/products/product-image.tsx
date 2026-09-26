"use client";

import Image from "next/image";
import { useRef, useTransition } from "react";
import { ImageOff, ImageUp, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  deleteProductImageAction,
  makeProductImageMainAction,
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
}: {
  productId: string;
  images: { id: string }[];
  name: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

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

  return (
    <div className="flex flex-col gap-2">
      {/* Картинок у сиденья бывает и сорок пять — ряд прокручивается, чтобы поля товара не уезжали вниз */}
      <div className={cn("flex max-h-56 flex-wrap items-start gap-2 overflow-y-auto", pending && "opacity-50")}>
        {images.map((image, index) => (
          <div key={image.id} className="group relative">
            <a href={imageUrl(image.id)} target="_blank" rel="noopener" title="Открыть в полном размере">
              <Image
                src={imageUrl(image.id, "thumb")}
                alt={index === 0 ? name : `${name} — картинка ${index + 1}`}
                width={96}
                height={96}
                unoptimized
                className={cn("size-24 rounded-md border object-cover", index === 0 && "border-primary border-2")}
              />
            </a>
            {index === 0 ? (
              <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1 text-[10px] leading-4">
                Главная
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
      <span className="text-muted-foreground text-xs">
        {images.length === 0
          ? "Картинок нет. JPEG, PNG, WebP или GIF до 5 МБ"
          : "Первая картинка — главная, её видно в списках. JPEG, PNG, WebP или GIF до 5 МБ"}
      </span>
    </div>
  );
}
