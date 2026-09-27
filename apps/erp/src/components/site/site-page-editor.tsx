"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { SITE_ORIGIN } from "@buscom/domain/company";
import { sitePagePath, type SitePageSlug } from "@buscom/domain/site/pages";
import { resetSitePageAction, saveSitePageAction } from "@/app/(app)/products/site-pages/actions";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Текст одной страницы сайта. Формат — packages/domain/src/site/page-text.ts:
 * подсказка под полем повторяет его коротко, чтобы не держать в голове.
 */
export function SitePageEditor({
  page,
  note,
  editable,
}: {
  page: {
    slug: SitePageSlug;
    title: string;
    metaTitle: string;
    metaDescription: string;
    body: string;
    edited: boolean;
    updatedAt: string | null;
    updatedByName: string | null;
  };
  note: string;
  editable: boolean;
}) {
  const [title, setTitle] = useState(page.title);
  const [metaTitle, setMetaTitle] = useState(page.metaTitle);
  const [metaDescription, setMetaDescription] = useState(page.metaDescription);
  const [body, setBody] = useState(page.body);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const id = `site-page-${page.slug}`;

  const dirty =
    title !== page.title ||
    metaTitle !== page.metaTitle ||
    metaDescription !== page.metaDescription ||
    body !== page.body;

  function save() {
    startTransition(async () => {
      const result = await saveSitePageAction(page.slug, { title, metaTitle, metaDescription, body });
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetSitePageAction(page.slug);
      setConfirmReset(false);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Поля показывают то, что теперь на сайте, — исходный текст придёт с перерисовкой страницы
      toast.success(result.message);
      window.location.reload();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{page.title}</CardTitle>
        <CardDescription>
          {page.edited && page.updatedAt
            ? `Изменено ${dateFormat.format(new Date(page.updatedAt))}${page.updatedByName ? `, ${page.updatedByName}` : ""}`
            : "Исходный текст"}
        </CardDescription>
        <CardAction>
          <Button asChild size="sm" variant="ghost">
            <a href={`${SITE_ORIGIN}${sitePagePath(page.slug)}`} target="_blank" rel="noreferrer">
              <ExternalLink />
              {sitePagePath(page.slug)}
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">{note}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor={`${id}-title`}>
              Заголовок на странице
            </Label>
            <Input
              id={`${id}-title`}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor={`${id}-meta-title`}>
              Title <span className="text-muted-foreground">({metaTitle.trim().length} зн., лучше до 70)</span>
            </Label>
            <Input
              id={`${id}-meta-title`}
              value={metaTitle}
              onChange={(event) => setMetaTitle(event.target.value)}
              disabled={!editable}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor={`${id}-meta-description`}>
            Description{" "}
            <span className="text-muted-foreground">({metaDescription.trim().length} зн., лучше до 160)</span>
          </Label>
          <Textarea
            id={`${id}-meta-description`}
            value={metaDescription}
            onChange={(event) => setMetaDescription(event.target.value)}
            disabled={!editable}
            className="min-h-14 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor={`${id}-body`}>
            Текст страницы
          </Label>
          <Textarea
            id={`${id}-body`}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            disabled={!editable}
            className="min-h-64 font-mono text-sm"
          />
          <span className="text-muted-foreground text-xs">
            «## » — заголовок раздела · «• » или «- » — пункт списка · «1. » — нумерованный пункт · «? » — вопрос, ответ
            строками ниже до пустой строки · любая другая строка — абзац
          </span>
        </div>
        {editable && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={save} disabled={pending || !dirty}>
              Сохранить
            </Button>
            {page.edited &&
              (confirmReset ? (
                <>
                  <span className="text-sm">Правки пропадут, на сайте будет исходный текст.</span>
                  <Button size="sm" variant="destructive" onClick={reset} disabled={pending}>
                    Вернуть исходный
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)} disabled={pending}>
                    Отмена
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setConfirmReset(true)} disabled={pending}>
                  Вернуть исходный текст
                </Button>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
