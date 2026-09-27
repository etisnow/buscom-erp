"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Галерея карточки: большой снимок и лента превью. Первый снимок предзагружается —
 * это LCP карточки. Размеры и webp — оптимизатор Next (next.config.ts, images).
 */
export function ProductGallery({ imageIds, name }: { imageIds: string[]; name: string }) {
  const [active, setActive] = useState(0);
  if (imageIds.length === 0) {
    return (
      <div className="bg-surface text-subtle flex aspect-square items-center justify-center rounded-lg">Нет фото</div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="border-line relative aspect-square overflow-hidden rounded-lg border bg-white">
        <Image
          src={`/img/${imageIds[active]}`}
          alt={name}
          fill
          sizes="(min-width: 1280px) 600px, (min-width: 1024px) 50vw, 100vw"
          preload={active === 0}
          className="object-contain"
        />
      </div>
      {imageIds.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {imageIds.map((id, index) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Фото ${index + 1}`}
                aria-current={index === active}
                className={`h-16 w-16 overflow-hidden rounded border bg-white ${index === active ? "border-brand" : "border-line hover:border-ink-2"}`}
              >
                <Image src={`/img/${id}`} alt="" width={64} height={64} className="h-full w-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
