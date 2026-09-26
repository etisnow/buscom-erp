import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CategoriesEditor } from "@/components/products/categories-editor";
import { listCategories } from "@/server/products/categories";
import { canEditCatalog } from "@/server/products/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Категории товаров — BusCom ERP",
};

export default async function CategoriesPage() {
  const user = await requirePageUser();
  const categories = await listCategories();

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/products"
        className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />К списку товаров
      </Link>

      <div>
        <h1 className="font-heading text-xl font-semibold">Категории товаров</h1>
        <p className="text-muted-foreground text-sm">
          Разделы и подкатегории. Фильтр по разделу в списке товаров показывает и товары его подкатегорий. Удалить можно
          только пустую категорию — без товаров и подкатегорий.
        </p>
      </div>

      <CategoriesEditor categories={categories} editable={canEditCatalog(user.role)} />
    </main>
  );
}
