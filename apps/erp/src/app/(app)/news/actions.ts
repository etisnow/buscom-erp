"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createNews, deleteNews, markNewsRead, updateNews } from "@/server/news/service";
import { ForbiddenError } from "@/server/errors";
import { requireUser } from "@/server/session";

export type NewsResult = { ok: true; message: string } | { ok: false; error: string };

/** Меню собирается в общем layout — его перечитываем вместе со страницей, чтобы значок обновился. */
async function run(action: () => Promise<unknown>, message: string): Promise<NewsResult> {
  try {
    await action();
    revalidatePath("/", "layout");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof Error) return { ok: false, error: error.message };
    throw error;
  }
}

type NewsFormValues = { title: string; body: string };

export async function createNewsAction(values: NewsFormValues): Promise<NewsResult> {
  const user = await requireUser();
  return run(() => createNews(values, user), "Запись опубликована");
}

export async function updateNewsAction(id: string, values: NewsFormValues): Promise<NewsResult> {
  const user = await requireUser();
  if (!z.string().min(1).safeParse(id).success) return { ok: false, error: "Неизвестная запись" };
  return run(() => updateNews(id, values, user), "Запись сохранена");
}

export async function deleteNewsAction(id: string): Promise<NewsResult> {
  const user = await requireUser();
  if (!z.string().min(1).safeParse(id).success) return { ok: false, error: "Неизвестная запись" };
  return run(() => deleteNews(id, user), "Запись удалена");
}

/** Страница показана — записи прочитаны. Без тоста: сотрудник ничего не делал. */
export async function markNewsReadAction(): Promise<void> {
  const user = await requireUser();
  if ((await markNewsRead(user)) > 0) revalidatePath("/", "layout");
}
