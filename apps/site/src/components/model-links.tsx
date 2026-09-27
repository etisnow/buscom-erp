import Link from "next/link";
import { MODELS_PATH, type SiteModel } from "@buscom/domain/site/models";

/** Модели ссылками с числом товаров — на странице подбора и на главной. */
export function ModelLinks({ models }: { models: SiteModel[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {models.map((model) => (
        <li key={model.slug}>
          <Link
            href={`${MODELS_PATH}/${model.slug}`}
            className="border-line-strong hover:border-brand flex h-[38px] items-center gap-2 rounded-full border bg-white px-4 text-sm"
          >
            {model.name}
            <span className="text-subtle text-sm">{model.productCount}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
