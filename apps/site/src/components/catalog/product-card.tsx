import Link from "next/link";
import type { ProductCard as Card } from "@/server/catalog";
import { Price } from "./price";

/**
 * `eager` — карточка в первом ряду списка: картинка грузится сразу, а у первой
 * (`priority`) ещё и с высоким приоритетом — это LCP страницы категории.
 */
export function ProductCard({ product, eager, priority }: { product: Card; eager?: boolean; priority?: boolean }) {
  return (
    <Link
      href={`/${product.slug}`}
      className="group border-line hover:border-brand flex flex-col rounded-lg border bg-white p-3 transition hover:shadow-sm"
    >
      <div className="bg-surface relative mb-3 flex aspect-square items-center justify-center overflow-hidden rounded">
        {product.isHit && <HitBadge className="absolute top-2 left-2" />}
        {product.imageId ? (
          // eslint-disable-next-line @next/next/no-img-element -- картинки отдаются готовым превью из базы; оптимизация — с переездом в хранилище (этап 3)
          <img
            src={`/img/${product.imageId}?size=thumb`}
            alt={product.name}
            loading={eager ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
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

export function HitBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`bg-accent rounded px-2 py-0.5 text-xs font-semibold text-white uppercase ${className}`}>Хит</span>
  );
}
