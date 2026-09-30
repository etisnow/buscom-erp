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
import { cn } from "@/lib/utils";
import { detectImportSite, IMPORT_SITES, looksLikeLink } from "@buscom/domain/product/import-sites";
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
  const typedSite = detectImportSite(url);

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
            Вставьте ссылку на страницу товара у поставщика. Скачаются название, описание, закупка, варианты (если они
            есть у поставщика) и снимки; знак и фон у нужных снимков убираются в форме товара. Товар заведётся, когда вы
            проверите форму и нажмёте «Сохранить».
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
            placeholder="https://… — ссылка на товар на одном из сайтов ниже"
            disabled={pending}
            autoFocus
          />
          {pending ? (
            <p className="text-muted-foreground text-xs">Скачиваю страницу и снимки…</p>
          ) : (
            <p
              className={cn(
                "text-xs",
                !typedSite && looksLikeLink(url) ? "text-destructive" : "text-muted-foreground",
                typedSite && "text-emerald-700 dark:text-emerald-400",
              )}
            >
              {typedSite
                ? `Сайт узнан: ${typedSite.name} (${typedSite.note})`
                : looksLikeLink(url)
                  ? "Этот сайт пока не поддерживается — список ниже"
                  : "Ссылка на страницу товара, а не раздела каталога"}
            </p>
          )}
        </form>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium">Поддерживаемые сайты</span>
          <ul className="flex flex-col gap-1">
            {IMPORT_SITES.map((site) => (
              <li key={site.host} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <a
                  href={`https://${site.host}/`}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("underline", typedSite?.host === site.host && "font-medium")}
                >
                  {site.name}
                </a>
                <span className="text-muted-foreground text-xs">
                  {site.host} — {site.note}
                </span>
              </li>
            ))}
          </ul>
        </div>
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
