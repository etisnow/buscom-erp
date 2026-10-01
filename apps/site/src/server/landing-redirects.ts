import "server-only";
import { landingCombos, landingPath, type LandingIndex } from "@buscom/domain/site/model-landing";
import { siteModels } from "@buscom/domain/site/models";
import { db } from "@/server/db";

/**
 * Какие посадочные «семейство + категория» есть на сайте — для 301 с тех, что пропали
 * (`landingRedirect`, proxy.ts). Считается по тем же правилам, что `getLandings` в catalog.ts,
 * но в памяти процесса: proxy выполняется вне рендера, кеш Next ему недоступен (как и в redirects.ts).
 */
const TTL_MS = 5 * 60 * 1000;

let cache: { index: LandingIndex; loadedAt: number } | null = null;
let loading: Promise<LandingIndex> | null = null;

async function load(): Promise<LandingIndex> {
  const [products, categories] = await Promise.all([
    db.product.findMany({
      where: { isActive: true, slug: { not: null }, compatibility: { isEmpty: false } },
      select: { categoryId: true, compatibility: true },
    }),
    db.productCategory.findMany({ where: { slug: { not: null } }, select: { id: true, slug: true, parentId: true } }),
  ]);
  const byId = new Map(categories.map((category) => [category.id, category]));
  // Категория товара и все её предки: страница раздела включает подкатегории
  const pathOf = (id: string | null): string[] => {
    const path: string[] = [];
    for (let node = id ? byId.get(id) : undefined; node; node = node.parentId ? byId.get(node.parentId) : undefined) {
      path.push(node.id);
    }
    return path;
  };
  const combos = landingCombos(
    products
      .filter((product) => product.categoryId)
      .map((product) => ({ categoryPath: pathOf(product.categoryId), compatibility: product.compatibility })),
  );
  return {
    pages: new Set(combos.map((combo) => landingPath(combo.familySlug, byId.get(combo.categoryId)?.slug as string))),
    families: new Set(siteModels(products).map((model) => model.slug)),
    categories: new Set(categories.map((category) => category.slug as string)),
  };
}

export async function landingIndex(): Promise<LandingIndex> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache.index;
  loading ??= load()
    .then((index) => {
      cache = { index, loadedAt: Date.now() };
      return index;
    })
    .finally(() => {
      loading = null;
    });
  try {
    return await loading;
  } catch (error) {
    // База недоступна — старый индекс лучше, чем падение каждого запроса к посадочным
    if (cache) return cache.index;
    throw error;
  }
}
