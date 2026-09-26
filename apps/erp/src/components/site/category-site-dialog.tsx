"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateCategorySiteAction } from "@/app/(app)/products/categories/actions";
import { SiteSeoFields, toSiteSeoDraft, toSiteSeoValue } from "@/components/site/site-seo-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CategoryRow } from "@/server/products/categories";

/** Адрес и метатеги категории на bus-com.ru. Открывается из дерева категорий. */
export function CategorySiteDialog({ category, onClose }: { category: CategoryRow; onClose: () => void }) {
  const [value, setValue] = useState(() => toSiteSeoValue(category));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateCategorySiteAction(category.id, toSiteSeoDraft(value));
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>«{category.name}» на сайте</DialogTitle>
          <DialogDescription>Адрес и метатеги страницы категории на bus-com.ru.</DialogDescription>
        </DialogHeader>
        <SiteSeoFields
          idPrefix="category-site"
          value={value}
          onChange={setValue}
          savedSlug={category.slug}
          titlePlaceholder={`${category.name} — купить в Нижнем Новгороде | Баском`}
        />
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
