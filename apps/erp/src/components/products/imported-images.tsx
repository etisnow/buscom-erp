"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Star, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { processImageAction, type ImageOperation } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import type { ImportedImage } from "@/server/products/supplier-import";

type Picture = { base64: string; contentType: string };

/**
 * Снимок из импорта в форме. `current` — то, что уйдёт в товар: сначала оригинал, потом
 * результат обработки (её можно применять поверх друг друга). `original` остаётся, чтобы вернуть.
 */
export type ImportedImageDraft = {
  sourceUrl: string;
  original: Picture;
  current: Picture;
  selected: boolean;
  busy: boolean;
  /** Чем ответил сервис на последней обработке */
  error: string | null;
};

export function toImageDrafts(images: ImportedImage[]): ImportedImageDraft[] {
  return images.map((image) => ({
    sourceUrl: image.sourceUrl,
    original: image.original,
    current: image.original,
    selected: false,
    busy: false,
    error: null,
  }));
}

/** То, что уйдёт в товар: снимок после обработки или оригинал */
export function chosenPicture(image: ImportedImageDraft): Picture {
  return image.current;
}

const OPERATIONS: [ImageOperation, string][] = [
  ["watermark", "Удалить водяной знак"],
  ["background", "Удалить фон"],
];
const CONCURRENCY = 2;

/**
 * Снимки нового товара из импорта с сайта поставщика. Ничего не обрабатывается само:
 * человек отмечает нужные снимки и запускает массовое действие — водяной знак или фон.
 * Первый снимок станет главным (аватаркой товара).
 */
export function ImportedImagesEditor({
  images,
  onChange,
}: {
  images: ImportedImageDraft[];
  onChange: Dispatch<SetStateAction<ImportedImageDraft[]>>;
}) {
  const [running, setRunning] = useState(false);
  const [viewing, setViewing] = useState<number | null>(null);

  if (images.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">Снимков не нашлось — их можно добавить после сохранения товара.</p>
    );
  }
  const selected = images.filter((image) => image.selected);
  const patch = (sourceUrl: string, changes: Partial<ImportedImageDraft>) =>
    onChange((all) => all.map((image) => (image.sourceUrl === sourceUrl ? { ...image, ...changes } : image)));

  async function run(operation: ImageOperation) {
    const queue = selected.slice();
    const total = queue.length;
    setRunning(true);
    let done = 0;
    let firstError: string | null = null;
    const worker = async () => {
      for (let image = queue.shift(); image; image = queue.shift()) {
        patch(image.sourceUrl, { busy: true, error: null });
        try {
          const result = await processImageAction(image.current.base64, operation);
          if (result.ok) {
            done++;
            patch(image.sourceUrl, {
              busy: false,
              current: { base64: result.base64, contentType: result.contentType },
            });
          } else {
            firstError ??= result.error;
            patch(image.sourceUrl, { busy: false, error: result.error });
          }
        } catch {
          firstError ??= "Не удалось связаться с сервером";
          patch(image.sourceUrl, { busy: false, error: "Не удалось связаться с сервером" });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
    setRunning(false);
    if (firstError) toast.error(`Обработано ${done} из ${total}. ${firstError}`);
    else toast.success(`Обработано снимков: ${done}`);
  }

  const busy = running || images.some((image) => image.busy);

  return (
    <div className="flex flex-col gap-2">
      <ImageLightbox
        images={images.map((image, index) => ({
          src: `data:${image.current.contentType};base64,${image.current.base64}`,
          alt: `Снимок ${index + 1}`,
        }))}
        index={viewing}
        onIndexChange={setViewing}
      />
      <span className="text-sm font-medium">
        Снимки <span className="text-muted-foreground font-normal">— первый станет главным</span>
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={selected.length === images.length}
            disabled={busy}
            onChange={(event) => onChange((all) => all.map((image) => ({ ...image, selected: event.target.checked })))}
          />
          Выбрать все
        </label>
        <span className="text-muted-foreground text-xs">Выбрано: {selected.length}</span>
        {OPERATIONS.map(([operation, label]) => (
          <Button
            key={operation}
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || selected.length === 0}
            onClick={() => run(operation)}
          >
            {label}
          </Button>
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((image, index) => {
          const src = `data:${image.current.contentType};base64,${image.current.base64}`;
          const edited = image.current !== image.original;
          return (
            <li
              key={image.sourceUrl}
              className={`flex flex-col gap-1.5 rounded-md border p-1.5 ${image.selected ? "border-primary" : ""}`}
            >
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setViewing(index)}
                  title="Открыть на весь экран"
                  className="bg-muted relative block aspect-[4/3] w-full overflow-hidden rounded"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- снимок ещё не сохранён, отдать его по адресу нельзя */}
                  <img src={src} alt="" className={`size-full object-contain ${image.busy ? "opacity-40" : ""}`} />
                  {index === 0 ? (
                    <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 text-[10px]">
                      главная
                    </span>
                  ) : null}
                  {image.busy ? (
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                      Обрабатываю…
                    </span>
                  ) : null}
                </button>
                <input
                  type="checkbox"
                  aria-label="Выбрать снимок"
                  checked={image.selected}
                  disabled={busy}
                  onChange={(event) => patch(image.sourceUrl, { selected: event.target.checked })}
                  className="absolute top-1.5 right-1.5 size-4"
                />
              </div>
              {image.error ? (
                <span className="text-[11px] text-amber-700" title={image.error}>
                  Не вышло — {image.error}
                </span>
              ) : edited ? (
                <span className="text-muted-foreground text-[11px]">Обработан</span>
              ) : null}
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={index === 0}
                  title="Сделать главной"
                  onClick={() =>
                    onChange((all) => {
                      const picked = all.find((item) => item.sourceUrl === image.sourceUrl);
                      return picked ? [picked, ...all.filter((item) => item !== picked)] : all;
                    })
                  }
                >
                  <Star />
                </Button>
                {edited ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy}
                    title="Вернуть оригинал"
                    onClick={() => patch(image.sourceUrl, { current: image.original, error: null })}
                  >
                    <Undo2 />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={busy}
                  title="Не брать этот снимок"
                  onClick={() => onChange((all) => all.filter((item) => item.sourceUrl !== image.sourceUrl))}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
