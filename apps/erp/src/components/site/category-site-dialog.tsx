"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { defaultTitle } from "@buscom/domain/site/meta";
import { updateCategorySiteAction } from "@/app/(app)/products/categories/actions";
import { SiteSeoFields, toSiteSeoDraft, toSiteSeoValue } from "@/components/site/site-seo-fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CategoryRow } from "@/server/products/categories";

/** Адрес, метатеги и текст категории на bus-com.ru. Открывается из дерева категорий. */
export function CategorySiteDialog({ category, onClose }: { category: CategoryRow; onClose: () => void }) {
  const [value, setValue] = useState(() => toSiteSeoValue(category));
  const [seoText, setSeoText] = useState(category.seoText ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateCategorySiteAction(category.id, {
        ...toSiteSeoDraft(value),
        seoText: seoText.trim() || null,
      });
      if (result.ok) {
        toast.success(result.message);
        onClose();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>«{category.name}» на сайте</DialogTitle>
          <DialogDescription>Адрес, метатеги и текст страницы категории на bus-com.ru.</DialogDescription>
        </DialogHeader>
        <SiteSeoFields
          idPrefix="category-site"
          value={value}
          onChange={setValue}
          savedSlug={category.slug}
          titlePlaceholder={defaultTitle(category.name)}
        />
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="category-site-text">
            Текст на странице
          </Label>
          <RichTextEditor
            id="category-site-text"
            value={seoText}
            onChange={setSeoText}
            placeholder="Текст под списком товаров: что в категории, как выбрать"
            className="max-h-72 min-h-32 text-sm"
          />
          <span className="text-muted-foreground text-xs">
            Показывается на сайте под списком товаров. Пусто — блока на странице нет.
          </span>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={save} disabled={pending}>
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
