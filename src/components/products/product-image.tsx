"use client";

import Image from "next/image";
import { useRef, useTransition } from "react";
import { ImageOff, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deleteProductImageAction, uploadProductImageAction } from "@/app/(app)/products/actions";

/**
 * Картинки отдаёт наш маршрут за авторизацией, поэтому оптимизатор Next не
 * нужен (`unoptimized`): он ходил бы за картинкой без cookie сессии. Размер
 * превью и так готовый — 228×228 с сайта.
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

/** Аватарка в карточке товара: показ, замена, удаление. */
export function ProductImageEditor({
  productId,
  imageId,
  name,
}: {
  productId: string;
  imageId: string | null;
  name: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  function upload(file: File) {
    const form = new FormData();
    form.set("file", file);
    startTransition(async () => {
      const result = await uploadProductImageAction(productId, form);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteProductImageAction(productId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex items-center gap-3">
      {imageId ? (
        <a href={imageUrl(imageId)} target="_blank" rel="noopener" title="Открыть в полном размере">
          <Image
            src={imageUrl(imageId, "thumb")}
            alt={name}
            width={96}
            height={96}
            unoptimized
            className={cn("size-24 rounded-md border object-cover", pending && "opacity-50")}
          />
        </a>
      ) : (
        <ProductThumb imageId={null} name={name} size={96} />
      )}

      <div className="flex flex-col gap-2">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
            event.target.value = "";
          }}
        />
        <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <Upload />
          {imageId ? "Заменить" : "Загрузить"}
        </Button>
        {imageId ? (
          <Button variant="ghost" size="sm" disabled={pending} onClick={remove}>
            <Trash2 />
            Удалить
          </Button>
        ) : null}
        <span className="text-muted-foreground text-xs">JPEG, PNG, WebP или GIF до 5 МБ</span>
      </div>
    </div>
  );
}
