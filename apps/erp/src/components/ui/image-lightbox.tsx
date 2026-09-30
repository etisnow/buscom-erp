"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";

export type LightboxImage = {
  src: string;
  alt: string;
  /** Ссылка «Открыть в новой вкладке»; для снимков, у которых адреса нет (data:), её не показываем */
  openHref?: string;
};

const SWIPE_PX = 50;

/**
 * Полноэкранный просмотр картинок прямо в ERP — вместо открытия файла в новой вкладке.
 * Управляется снаружи: `index` — какая картинка открыта (`null` — просмотр закрыт).
 * Стрелки ← → и кнопки листают, Esc, крестик и щелчок по фону закрывают, на телефоне листает свайп.
 * Радикс держит фокус внутри и возвращает его на миниатюру; поверх диалога (карточка товара)
 * просмотр открывается вторым слоем — Esc закрывает только его.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const touchStart = useRef<number | null>(null);
  const image = index === null ? undefined : images[index];
  const many = images.length > 1;

  function go(step: number) {
    if (index === null || !many) return;
    onIndexChange((index + step + images.length) % images.length);
  }

  return (
    <DialogPrimitive.Root open={image !== undefined} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-[70] bg-black/90 duration-100" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-[70] flex flex-col outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") go(-1);
            if (event.key === "ArrowRight") go(1);
          }}
          onTouchStart={(event) => {
            touchStart.current = event.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            const end = event.changedTouches[0]?.clientX;
            touchStart.current = null;
            if (start === null || end === undefined || Math.abs(end - start) < SWIPE_PX) return;
            go(end < start ? 1 : -1);
          }}
        >
          <DialogPrimitive.Title className="sr-only">{image?.alt ?? "Просмотр картинки"}</DialogPrimitive.Title>

          <div className="flex shrink-0 items-center gap-2 p-3 text-sm text-white">
            <span className="truncate">{image?.alt}</span>
            {many && index !== null ? (
              <span className="text-white/60">
                {index + 1} из {images.length}
              </span>
            ) : null}
            <span className="ml-auto flex items-center gap-1">
              {image?.openHref ? (
                <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white">
                  <a href={image.openHref} target="_blank" rel="noopener" title="Открыть в новой вкладке">
                    <ExternalLink />
                    <span className="sr-only">Открыть в новой вкладке</span>
                  </a>
                </Button>
              ) : null}
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" size="icon" className="text-white hover:bg-white/15 hover:text-white">
                  <XIcon />
                  <span className="sr-only">Закрыть</span>
                </Button>
              </DialogPrimitive.Close>
            </span>
          </div>

          {/* Щелчок по свободному месту закрывает просмотр; по самой картинке — нет */}
          <div
            className="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-3 md:px-16"
            onClick={(event) => event.target === event.currentTarget && onIndexChange(null)}
          >
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- адрес за авторизацией или data:, оптимизатор Next тут не нужен
              <img src={image.src} alt={image.alt} className="max-h-full max-w-full rounded-md object-contain" />
            ) : null}
            {many ? (
              <>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="absolute top-1/2 left-2 hidden -translate-y-1/2 text-white hover:bg-white/15 hover:text-white md:inline-flex"
                  onClick={() => go(-1)}
                >
                  <ChevronLeft />
                  <span className="sr-only">Предыдущая</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="absolute top-1/2 right-2 hidden -translate-y-1/2 text-white hover:bg-white/15 hover:text-white md:inline-flex"
                  onClick={() => go(1)}
                >
                  <ChevronRight />
                  <span className="sr-only">Следующая</span>
                </Button>
              </>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
