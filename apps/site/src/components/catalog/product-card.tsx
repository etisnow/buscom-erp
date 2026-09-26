import Link from "next/link";
import type { ProductCard as Card } from "@/server/catalog";
import { Price } from "./price";

export function ProductCard({ product }: { product: Card }) {
  return (
    <Link
      href={`/${product.slug}`}
      className="group border-line hover:border-brand flex flex-col rounded-lg border bg-white p-3 transition hover:shadow-sm"
    >
      <div className="bg-surface mb-3 flex aspect-square items-center justify-center overflow-hidden rounded">
        {product.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- картинки отдаются готовым превью из базы; оптимизация — с переездом в хранилище (этап 3)
          <img
            src={`/img/${product.imageId}?size=thumb`}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-subtle text-sm">Нет фото</span>
        )}
      </div>
      <span className="text-subtle font-mono text-xs">{product.sku}</span>
      <span className="group-hover:text-brand mt-1 line-clamp-3 grow font-medium">{product.name}</span>
      <Price kopecks={product.priceKopecks} from={product.hasChoice} className="mt-2 text-lg font-semibold" />
    </Link>
  );
}
