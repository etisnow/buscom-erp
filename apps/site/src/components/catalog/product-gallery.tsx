"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { NoPhoto } from "./product-card";

/**
 * Галерея карточки (макет, экран 03): большой снимок и превью — столбиком слева на
 * десктопе, лентой снизу на телефоне. Первый снимок предзагружается — это LCP
 * карточки. Размеры и webp — оптимизатор Next (next.config.ts, images).
 * `badges` — метки поверх снимка («Хит»).
 */
export function ProductGallery({ imageIds, name, badges }: { imageIds: string[]; name: string; badges?: ReactNode }) {
  const [active, setActive] = useState(0);
  return (
    <div className="card grid grid-cols-1 gap-3 p-3 md:p-5 lg:grid-cols-[84px_minmax(0,1fr)] lg:gap-5">
      <div className="relative aspect-square lg:order-last">
        {imageIds.length > 0 ? (
          <Image
            src={`/img/${imageIds[active]}`}
            alt={name}
            fill
            sizes="(min-width: 1440px) 640px, (min-width: 1024px) 45vw, 100vw"
            preload={active === 0}
            className="object-contain"
          />
        ) : (
          <NoPhoto />
        )}
        {badges && <div className="absolute top-0 left-0 z-10 flex gap-1.5">{badges}</div>}
      </div>
      {imageIds.length > 1 && (
        <ul className="flex gap-2 overflow-x-auto pb-1 lg:max-h-[600px] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:pb-0">
          {imageIds.map((id, index) => (
            <li key={id} className="shrink-0">
              <button
                type="button"
                onClick={() => setActive(index)}
                aria-label={`Фото ${index + 1}`}
                aria-current={index === active}
                className={`block size-16 overflow-hidden rounded-[10px] border-2 bg-white p-1 lg:size-[84px] ${
                  index === active ? "border-brand" : "border-line hover:border-line-strong"
                }`}
              >
                <Image src={`/img/${id}`} alt="" width={84} height={84} className="size-full object-contain" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
