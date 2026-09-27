"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SITE_PAGE_SLUGS } from "@buscom/domain/site/pages";
import { ForbiddenError } from "@/server/errors";
import { resetSitePage, saveSitePage } from "@/server/site/pages";
import { requireUser } from "@/server/session";

export type SitePageResult = { ok: true; message: string } | { ok: false; error: string };

const slugSchema = z.enum(SITE_PAGE_SLUGS, { error: "Такой страницы на сайте нет" });

const pageSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, { error: "Укажите заголовок" })
    .max(200, { error: "Заголовок не длиннее 200 знаков" }),
  metaTitle: z.string().trim().min(1, { error: "Укажите Title" }).max(300, { error: "Title не длиннее 300 знаков" }),
  metaDescription: z.string().max(1000, { error: "Description не длиннее 1000 знаков" }),
  body: z.string().max(50_000, { error: "Текст слишком длинный" }),
});

async function run(action: () => Promise<unknown>, message: string): Promise<SitePageResult> {
  try {
    await action();
    revalidatePath("/products/site-pages");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function saveSitePageAction(slug: string, input: z.input<typeof pageSchema>): Promise<SitePageResult> {
  const user = await requireUser();
  const parsedSlug = slugSchema.safeParse(slug);
  const parsed = pageSchema.safeParse(input);
  if (!parsedSlug.success) return { ok: false, error: z.prettifyError(parsedSlug.error) };
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(
    () => saveSitePage(parsedSlug.data, parsed.data, user),
    "Страница сохранена — на сайте появится в течение 5 минут",
  );
}

export async function resetSitePageAction(slug: string): Promise<SitePageResult> {
  const user = await requireUser();
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) return { ok: false, error: z.prettifyError(parsedSlug.error) };
  return run(() => resetSitePage(parsedSlug.data, user), "Возвращён исходный текст");
}
