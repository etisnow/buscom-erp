import "server-only";
import { parseSlugInput, slugify, uniqueSlug } from "@buscom/domain/site/slug";
import type { Tx } from "@/server/orders/internal";

/**
 * Адрес и метатеги товара или категории на сайте bus-com.ru (docs/SITE-PRD.md,
 * «Адреса»). Правятся в ERP — своей админки у сайта нет.
 *
 * Слуг один на весь сайт: товары и категории живут на одном уровне адресов, так
 * что проверяется занятость в обеих таблицах. Смена слуга оставляет на старом
 * адресе переадресацию 301 на этот же товар (`UrlRedirect`) — ссылки из поиска и
 * закладок не ломаются. Вернули слуг на адрес, где стояла переадресация, — она
 * убирается: адрес снова канонический.
 */

export type SiteSeoDraft = {
  /** Пусто — на сайте не показывается */
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

export type SeoTarget = { kind: "product"; id: string } | { kind: "category"; id: string };

export class SiteSeoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteSeoError";
  }
}

const clean = (value: string | null | undefined, max: number) => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length > max) throw new SiteSeoError(`Метатег длиннее ${max} знаков`);
  return text || null;
};

/** Занят ли слуг кем-то, кроме `target`. Возвращает, кем — для текста ошибки. */
async function slugOwner(tx: Tx, slug: string, target?: SeoTarget): Promise<string | null> {
  const [product, category] = await Promise.all([
    tx.product.findUnique({ where: { slug }, select: { id: true, name: true } }),
    tx.productCategory.findUnique({ where: { slug }, select: { id: true, name: true } }),
  ]);
  if (product && !(target?.kind === "product" && target.id === product.id)) return `товаром «${product.name}»`;
  if (category && !(target?.kind === "category" && target.id === category.id)) return `категорией «${category.name}»`;
  return null;
}

export async function applySiteSeo(tx: Tx, target: SeoTarget, draft: SiteSeoDraft): Promise<void> {
  const parsed = parseSlugInput(draft.slug);
  if ("error" in parsed) throw new SiteSeoError(parsed.error);
  const { slug } = parsed;
  if (slug) {
    const owner = await slugOwner(tx, slug, target);
    if (owner) throw new SiteSeoError(`Адрес /${slug} уже занят ${owner}`);
    // Старый адрес другого товара или категории: переадресация с него ведёт туда,
    // и отдать его под новую страницу — значит сломать старые ссылки
    const redirect = await tx.urlRedirect.findUnique({
      where: { fromPath: `/${slug}` },
      select: { productId: true, categoryId: true, toPath: true },
    });
    const ours = target.kind === "product" ? redirect?.productId === target.id : redirect?.categoryId === target.id;
    if (redirect && !ours && (redirect.productId || redirect.categoryId)) {
      throw new SiteSeoError(`Адрес /${slug} — прежний адрес другой страницы, с него стоит переадресация`);
    }
  }

  const current =
    target.kind === "product"
      ? await tx.product.findUniqueOrThrow({ where: { id: target.id }, select: { slug: true } })
      : await tx.productCategory.findUniqueOrThrow({ where: { id: target.id }, select: { slug: true } });

  const data = {
    slug,
    metaTitle: clean(draft.metaTitle, 300),
    metaDescription: clean(draft.metaDescription, 1000),
  };
  if (target.kind === "product") await tx.product.update({ where: { id: target.id }, data });
  else await tx.productCategory.update({ where: { id: target.id }, data });

  const link = target.kind === "product" ? { productId: target.id } : { categoryId: target.id };
  if (current.slug && current.slug !== slug) {
    const fromPath = `/${current.slug}`;
    await tx.urlRedirect.upsert({
      where: { fromPath },
      create: { fromPath, ...link, statusCode: 301 },
      update: { productId: null, categoryId: null, toPath: null, statusCode: 301, ...link },
    });
  }
  if (slug) await tx.urlRedirect.deleteMany({ where: { fromPath: `/${slug}` } });
}

/** Слуг для нового товара из ERP — из названия, свободный на всём сайте. */
export async function freeSlugFor(tx: Tx, name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set<string>();
  const [products, categories] = await Promise.all([
    tx.product.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } }),
    tx.productCategory.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } }),
  ]);
  for (const row of [...products, ...categories]) if (row.slug) taken.add(row.slug);
  // Путь, с которого стоит переадресация, тоже занят: иначе новый товар перехватил бы старую ссылку
  const redirects = await tx.urlRedirect.findMany({
    where: { fromPath: { startsWith: `/${base}` } },
    select: { fromPath: true },
  });
  for (const row of redirects) taken.add(row.fromPath.slice(1));
  return uniqueSlug(base, taken);
}
