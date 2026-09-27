import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CompatibilityReview } from "@/components/products/compatibility-review";
import { listCompatibilityReview } from "@/server/products/compatibility-review";
import { canEditCatalog } from "@/server/products/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Разбор совместимости — BusCom ERP",
};

export default async function CompatibilityReviewPage() {
  const user = await requirePageUser();
  const { rows, withoutModels } = await listCompatibilityReview();

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/products"
        className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />К списку товаров
      </Link>

      <div>
        <h1 className="font-heading text-xl font-semibold">Разбор совместимости</h1>
        <p className="text-muted-foreground text-sm">
          Товары в продаже без моделей, у которых название или описание подсказывает модели: {rows.length} из{" "}
          {withoutModels} без моделей. Отмеченное подсказкой можно поправить; сохранённый товар уходит из списка. По
          моделям на сайте работает фильтр в категориях.
        </p>
      </div>

      <CompatibilityReview rows={rows} editable={canEditCatalog(user.role)} />
    </main>
  );
}
