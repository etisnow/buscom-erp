import Image from "next/image";
import Link from "next/link";
import type { ProductCard as Card } from "@/server/catalog";
import { AddToCartButton } from "./add-to-cart-button";
import { Price } from "./price";

/**
 * Карточка товара в списке (макет, экраны 01 и 02): снимок, название, цена и
 * «В корзину». Ссылка — снимок и название, кнопка отдельно: кнопку внутри ссылки не вложить.
 *
 * `eager` — карточка в первом ряду списка: картинка грузится сразу, а у первой
 * (`priority`) ещё и с высоким приоритетом — это LCP страницы категории.
 */
export function ProductCard({ product, eager, priority }: { product: Card; eager?: boolean; priority?: boolean }) {
  return (
    <article className="group card flex flex-col gap-2.5 rounded-[14px] p-3 transition hover:shadow-[0_10px_28px_rgba(21,25,30,.1)] md:p-3.5">
      <Link href={`/${product.slug}`} className="relative flex aspect-square items-center justify-center" tabIndex={-1}>
        {product.imageId ? (
          // Оптимизатор Next режет оригинал под ширину колонки и отдаёт webp (next.config.ts, images)
          <Image
            src={`/img/${product.imageId}`}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 280px, (min-width: 768px) 33vw, 50vw"
            loading={eager ? "eager" : "lazy"}
            fetchPriority={priority ? "high" : undefined}
            className="object-contain"
          />
        ) : (
          <NoPhoto />
        )}
        {product.isHit && <HitBadge className="absolute top-0 left-0 z-10" />}
      </Link>
      <span className="text-subtle font-mono text-xs">{product.sku}</span>
      <Link
        href={`/${product.slug}`}
        className="group-hover:text-brand line-clamp-2 min-h-[2.7em] text-sm leading-[1.35]"
      >
        {product.name}
      </Link>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        <Price
          kopecks={product.priceKopecks}
          from={product.hasChoice}
          className="text-lg font-bold whitespace-nowrap"
        />
        <AddToCartButton product={product} wide />
      </div>
    </article>
  );
}

export function HitBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`bg-accent text-ink flex h-[22px] items-center rounded-md px-2 text-[11px] font-bold uppercase ${className}`}
    >
      Хит
    </span>
  );
}

/** Заглушка без снимка — штриховка из макета */
export function NoPhoto({ className = "size-full" }: { className?: string }) {
  return (
    <span
      className={`text-subtle flex items-center justify-center rounded-lg bg-[repeating-linear-gradient(135deg,#eef0ee_0_8px,#f7f8f7_8px_16px)] font-mono text-[10px] ${className}`}
    >
      фото
    </span>
  );
}
