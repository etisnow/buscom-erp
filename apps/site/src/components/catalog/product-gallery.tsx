"use client";

import { useState } from "react";

/** Галерея карточки: большой снимок и лента превью. Первый снимок грузится сразу — это LCP карточки. */
export function ProductGallery({ imageIds, name }: { imageIds: string[]; name: string }) {
  const [active, setActive] = useState(0);
  if (imageIds.length === 0) {
    return (
      <div className="bg-surface text-subtle flex aspect-square items-center justify-center rounded-lg">Нет фото</div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="border-line flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- оптимизация картинок — с переездом в хранилище (этап 3) */}
        <img
          src={`/img/${imageIds[active]}`}
          alt={name}
          fetchPriority={active === 0 ? "high" : "auto"}
          className="h-full w-full object-contain"
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/img/${id}?size=thumb`} alt="" loading="lazy" className="h-full w-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
