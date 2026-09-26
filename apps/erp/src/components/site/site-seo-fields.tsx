"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type SiteSeoValue = { slug: string; metaTitle: string; metaDescription: string };

export const toSiteSeoValue = (row: {
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
}): SiteSeoValue => ({
  slug: row.slug ?? "",
  metaTitle: row.metaTitle ?? "",
  metaDescription: row.metaDescription ?? "",
});

export const toSiteSeoDraft = (value: SiteSeoValue) => ({
  slug: value.slug.trim() || null,
  metaTitle: value.metaTitle.trim() || null,
  metaDescription: value.metaDescription.trim() || null,
});

/**
 * Адрес и метатеги страницы на bus-com.ru (docs/SITE-PRD.md, «Требования к SEO»).
 * Проверка — на сервере (src/server/site/seo.ts): формат адреса, занятость, и
 * переадресация со старого адреса при смене.
 */
export function SiteSeoFields({
  idPrefix,
  value,
  onChange,
  savedSlug,
  titlePlaceholder,
}: {
  idPrefix: string;
  value: SiteSeoValue;
  onChange: (value: SiteSeoValue) => void;
  /** Адрес, сохранённый сейчас, — чтобы предупредить о переадресации при смене */
  savedSlug: string | null;
  titlePlaceholder: string;
}) {
  const slug = value.slug.trim().toLowerCase();
  const changed = savedSlug !== null && slug !== savedSlug;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${idPrefix}-slug`}>
          Адрес на сайте
        </Label>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-sm">bus-com.ru/</span>
          <Input
            id={`${idPrefix}-slug`}
            value={value.slug}
            onChange={(event) => onChange({ ...value, slug: event.target.value })}
            placeholder="не показывается на сайте"
            className="font-mono text-sm"
          />
        </div>
        <span className="text-muted-foreground text-xs">
          {changed
            ? slug
              ? `Со старого адреса /${savedSlug} будет переадресация на новый — ссылки из поиска не сломаются.`
              : `Страница пропадёт с сайта; с /${savedSlug} будет переадресация, пока адрес не отдадут другой странице.`
            : "Латиница, цифры и дефис. Пусто — на сайте не показывается."}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${idPrefix}-title`}>
          Title <span className="text-muted-foreground">({value.metaTitle.trim().length} зн., лучше до 70)</span>
        </Label>
        <Input
          id={`${idPrefix}-title`}
          value={value.metaTitle}
          onChange={(event) => onChange({ ...value, metaTitle: event.target.value })}
          placeholder={titlePlaceholder}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs" htmlFor={`${idPrefix}-description`}>
          Description{" "}
          <span className="text-muted-foreground">({value.metaDescription.trim().length} зн., лучше до 160)</span>
        </Label>
        <Textarea
          id={`${idPrefix}-description`}
          value={value.metaDescription}
          onChange={(event) => onChange({ ...value, metaDescription: event.target.value })}
          placeholder="Пусто — начало описания товара"
          className="min-h-16 text-sm"
        />
      </div>
    </div>
  );
}
