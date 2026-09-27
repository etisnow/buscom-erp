import type { Metadata } from "next";
import { MODELS_PATH } from "@buscom/domain/site/models";
import { Breadcrumbs } from "@/components/catalog/breadcrumbs";
import { ModelLinks } from "@/components/model-links";
import { COMPANY } from "@/config/company";
import { pageMetadata } from "@/config/metadata";
import { getModels } from "@/server/catalog";

export const metadata: Metadata = pageMetadata({
  title: `Подбор комплектующих по модели микроавтобуса | ${COMPANY.brand}`,
  description:
    "Сиденья, детали салона и кузова для ГАЗели, Sprinter, Crafter, Transit и других моделей — подбор по модели.",
  path: MODELS_PATH,
});

export const dynamic = "force-dynamic";

/** Все модели, для которых есть товары (этап 7). Пусто — страница пока не нужна. */
export default async function ModelsPage() {
  const models = await getModels();
  return (
    <section>
      <Breadcrumbs items={[]} current="Подбор по модели" />
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Подбор по модели</h1>
      {models.length === 0 ? (
        <p className="text-ink-2">Подбор по модели скоро появится. Пока спросите нас: {COMPANY.phone.display}.</p>
      ) : (
        <ModelLinks models={models} />
      )}
    </section>
  );
}
