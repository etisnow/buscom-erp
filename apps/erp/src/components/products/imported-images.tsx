"use client";

import { Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ImportedImage } from "@/server/products/supplier-import";

/** Снимок из импорта в форме: какой вариант берём — без знака или оригинал. */
export type ImportedImageDraft = ImportedImage & { useCleaned: boolean };

export function toImageDrafts(images: ImportedImage[]): ImportedImageDraft[] {
  return images.map((image) => ({ ...image, useCleaned: image.cleaned !== null }));
}

/** base64 выбранного варианта — то, что уйдёт в товар */
export function chosenBase64(image: ImportedImageDraft): string {
  return image.useCleaned && image.cleaned ? image.cleaned.base64 : image.original.base64;
}

/**
 * Снимки нового товара из импорта с сайта поставщика. Сервис снятия знака
 * перерисовывает участок нейросетью — у каждого снимка можно вернуть оригинал.
 * Первый снимок станет главным (аватаркой товара).
 */
export function ImportedImagesEditor({
  images,
  onChange,
}: {
  images: ImportedImageDraft[];
  onChange: (images: ImportedImageDraft[]) => void;
}) {
  if (images.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">Снимков не нашлось — их можно добавить после сохранения товара.</p>
    );
  }
  const update = (index: number, patch: Partial<ImportedImageDraft>) =>
    onChange(images.map((image, i) => (i === index ? { ...image, ...patch } : image)));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">
        Снимки <span className="text-muted-foreground font-normal">— первый станет главным</span>
      </span>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((image, index) => {
          const shown = image.useCleaned && image.cleaned ? image.cleaned : image.original;
          return (
            <li key={image.sourceUrl} className="flex flex-col gap-1.5 rounded-md border p-1.5">
              <a
                href={`data:${shown.contentType};base64,${shown.base64}`}
                target="_blank"
                rel="noreferrer"
                title="Открыть крупно"
                className="bg-muted relative block aspect-[4/3] overflow-hidden rounded"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- снимок ещё не сохранён, отдать его по адресу нельзя */}
                <img
                  src={`data:${shown.contentType};base64,${shown.base64}`}
                  alt=""
                  className="size-full object-contain"
                />
                {index === 0 ? (
                  <span className="bg-primary text-primary-foreground absolute top-1 left-1 rounded px-1.5 text-[10px]">
                    главная
                  </span>
                ) : null}
              </a>
              {image.cleaned ? (
                <div className="bg-muted flex rounded p-0.5 text-[11px]" role="group" aria-label="Какой снимок взять">
                  {(
                    [
                      [true, "Без знака"],
                      [false, "Оригинал"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={image.useCleaned === value}
                      onClick={() => update(index, { useCleaned: value })}
                      className={`flex-1 rounded px-1 py-0.5 ${image.useCleaned === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="text-[11px] text-amber-700" title={image.error ?? undefined}>
                  Знак не снят{image.error && image.error !== "не настроено" ? ` — ${image.error}` : ""}
                </span>
              )}
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={index === 0}
                  title="Сделать главной"
                  onClick={() => onChange([image, ...images.filter((_, i) => i !== index)])}
                >
                  <Star />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Не брать этот снимок"
                  onClick={() => onChange(images.filter((_, i) => i !== index))}
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
