"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { importFromSupplierAction } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SupplierImportDraft } from "@/server/products/supplier-import";

/**
 * «Импорт с сайта поставщика»: ссылка на товар → черновик. Черновик открывается в
 * форме нового товара, где человек всё сверяет и сохраняет.
 */
export function SupplierImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (draft: SupplierImportDraft) => void;
}) {
  const [url, setUrl] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await importFromSupplierAction(url);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setUrl("");
      onOpenChange(false);
      onImported(result.draft);
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Импорт с сайта поставщика</DialogTitle>
          <DialogDescription>
            Пока — «Фургон Проект» (vanproject.ru). Скачаются название, описание, варианты с закупками и снимки; водяной
            знак со снимков снимется. Товар заведётся, когда вы проверите форму и нажмёте «Сохранить».
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Label className="text-xs" htmlFor="supplier-import-url">
            Ссылка на товар
          </Label>
          <Input
            id="supplier-import-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://vanproject.ru/catalog/…"
            disabled={pending}
            autoFocus
          />
          {pending ? (
            <p className="text-muted-foreground text-xs">
              Скачиваю страницу и снимки, снимаю водяные знаки — это может занять до пары минут…
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={pending || url.trim() === ""}>
            {pending ? "Импортирую…" : "Импортировать"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
