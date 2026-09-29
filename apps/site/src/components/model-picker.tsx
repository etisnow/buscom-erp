"use client";

import Link from "next/link";
import { useState, type MouseEvent } from "react";
import { MODELS_PATH, type SiteModel } from "@buscom/domain/site/models";

/**
 * «Подбор по модели автомобиля» на главной (макет, экран 01): выбор модели и
 * кнопка, ведущая на её страницу; «Все модели» — на список. Без JavaScript
 * модели остаются обычными ссылками.
 */
export function ModelPicker({ models }: { models: SiteModel[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const chip = (active: boolean) =>
    `flex h-[38px] shrink-0 items-center rounded-full border px-[15px] text-sm ${
      active ? "bg-brand border-brand text-white" : "border-line-strong hover:border-brand bg-white"
    }`;
  const pick = (slug: string | null) => (event: MouseEvent) => {
    event.preventDefault();
    setPicked(slug);
  };
  return (
    <div className="flex flex-col gap-3.5">
      <ul className="-mx-5 flex gap-2 overflow-x-auto px-5 md:mx-0 md:flex-wrap md:px-0">
        <li>
          <Link href={MODELS_PATH} onClick={pick(null)} className={chip(picked === null)}>
            Все модели
          </Link>
        </li>
        {models.map((model) => (
          <li key={model.slug}>
            <Link
              href={`${MODELS_PATH}/${model.slug}`}
              onClick={pick(model.slug)}
              className={chip(picked === model.slug)}
            >
              {model.name}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        <Link
          href={picked ? `${MODELS_PATH}/${picked}` : MODELS_PATH}
          className="bg-accent hover:bg-accent-hover text-ink flex h-12 items-center justify-center rounded-[10px] px-6 text-[15px] font-semibold"
        >
          Подобрать детали
        </Link>
        <span className="text-muted hidden text-sm md:inline">
          Не нашли модель? Подберём по фото в Max, WhatsApp или Telegram
        </span>
      </div>
    </div>
  );
}
