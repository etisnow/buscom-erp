"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CategoryError } from "@buscom/domain/product/categories";
import { ForbiddenError } from "@/server/errors";
import { createCategory, deleteCategory, updateCategory } from "@/server/products/categories";
import { requireUser } from "@/server/session";

export type CategoryResult = { ok: true; message: string } | { ok: false; error: string };

const categorySchema = z.object({
  name: z.string(),
  parentId: z.string().min(1).nullable(),
});

async function run(action: () => Promise<unknown>, message: string): Promise<CategoryResult> {
  try {
    await action();
    revalidatePath("/products/categories");
    revalidatePath("/products");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof CategoryError || error instanceof ForbiddenError) return { ok: false, error: error.message };
    throw error;
  }
}

export async function createCategoryAction(input: z.input<typeof categorySchema>): Promise<CategoryResult> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(() => createCategory(parsed.data, user), "Категория добавлена");
}

export async function updateCategoryAction(id: string, input: z.input<typeof categorySchema>): Promise<CategoryResult> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return run(() => updateCategory(id, parsed.data, user), "Категория сохранена");
}

export async function deleteCategoryAction(id: string): Promise<CategoryResult> {
  const user = await requireUser();
  return run(() => deleteCategory(id, user), "Категория удалена");
}
