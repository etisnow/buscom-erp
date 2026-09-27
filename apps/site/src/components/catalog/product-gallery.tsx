"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NoPhoto } from "./product-card";

/**
 * Галерея карточки (макет, экран 03): большой снимок и превью — столбиком слева на
 * десктопе, лентой снизу на телефоне. Лента листается без видимой полосы прокрутки
 * (полоса съедала ширину превью), стрелками на снимке и щелчком по превью; выбранное
 * превью докручивается в видимую часть. Первый снимок предзагружается — это LCP
 * карточки. Размеры и webp — оптимизатор Next (next.config.ts, images).
 * `badges` — метки поверх снимка («Хит»).
 */
export function ProductGallery({ imageIds, name, badges }: { imageIds: string[]; name: string; badges?: ReactNode }) {
  const [active, setActive] = useState(0);
  const strip = useRef<HTMLUListElement>(null);
  const count = imageIds.length;

  // Прокручиваем только ленту, не страницу: scrollIntoView дёргал бы всю страницу
  useEffect(() => {
    const list = strip.current;
    const item = list?.children[active] as HTMLElement | undefined;
    if (!list || !item) return;
    const vertical = list.scrollHeight > list.clientHeight;
    if (vertical) {
      const top = item.offsetTop - list.offsetTop;
      if (top < list.scrollTop) list.scrollTo({ top, behavior: "smooth" });
      else if (top + item.offsetHeight > list.scrollTop + list.clientHeight)
        list.scrollTo({ top: top + item.offsetHeight - list.clientHeight, behavior: "smooth" });
    } else {
      const left = item.offsetLeft - list.offsetLeft;
      if (left < list.scrollLeft) list.scrollTo({ left, behavior: "smooth" });
      else if (left + item.offsetWidth > list.scrollLeft + list.clientWidth)
        list.scrollTo({ left: left + item.offsetWidth - list.clientWidth, behavior: "smooth" });
    }
  }, [active]);

  const arrow =
    "text-ink-2 hover:text-brand absolute top-1/2 z-10 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-white/90 text-lg shadow-sm";
  return (
    <div className="card grid grid-cols-1 gap-3 p-3 md:p-5 lg:grid-cols-[84px_minmax(0,1fr)] lg:gap-5">
      <div className="relative aspect-square lg:order-last">
        {count > 0 ? (
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
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => setActive((active - 1 + count) % count)}
              aria-label="Предыдущее фото"
              className={`${arrow} left-0`}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setActive((active + 1) % count)}
              aria-label="Следующее фото"
              className={`${arrow} right-0`}
            >
              ›
            </button>
            <span className="bg-ink/70 absolute right-0 bottom-0 rounded-md px-2 py-0.5 text-xs text-white">
              {active + 1} / {count}
            </span>
          </>
        )}
      </div>
      {count > 1 && (
        // На десктопе лента во всю высоту снимка: обёртка тянется по строке сетки, лента — внутри неё
        <div className="relative lg:h-full">
          <ul
            ref={strip}
            className="flex [scrollbar-width:none] gap-2 overflow-x-auto lg:absolute lg:inset-0 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto [&::-webkit-scrollbar]:hidden"
          >
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
        </div>
      )}
    </div>
  );
}
