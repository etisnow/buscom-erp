import { oldPath, type OldPage } from "./old-site";
import { isValidSlug, slugify, uniqueSlug } from "./slug";

/**
 * Что взять в базу из снимка старого сайта (`docs/site-snapshot/pages.json`):
 * слуги и метатеги товаров и категорий и переадресации со всех прочих адресов.
 * Правила — `docs/SITE-PRD.md`, «Требования к SEO», решения владельца от 26.09.2026.
 *
 * - Слуг — последний сегмент canonical старой страницы: он уже короткий. У товаров,
 *   чей canonical `index.php?…product_id=N`, слуга не было — он строится из названия.
 * - Метатеги — дословно, как написаны на старом сайте.
 * - Каждый прочий адрес товара или категории — 301 на них. Категория, которой в ERP
 *   нет, ведёт на родителя, а без него — на главную; туда же производители и
 *   убранные страницы. Статические страницы остаются на своих адресах.
 * - Слуг, уже заданный в ERP, не перезаписывается: его могли поправить руками.
 */

/** Строка снимка `docs/site-snapshot/pages.json` (пишет `pnpm snapshot:old-site`). */
export type OldSnapshotRow = {
  path: string;
  url: string;
  /** Откуда адрес: из карты сайта, canonical другой страницы или добавлен руками (главная) */
  source: "sitemap" | "canonical" | "extra";
  priority: string | null;
  status: number;
  /** Куда ведёт переадресация, если старый сайт ответил ею */
  location: string | null;
  page: OldPage | null;
  error?: string;
};

export type ErpProduct = {
  id: string;
  externalId: string | null;
  name: string;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

export type ErpCategory = {
  id: string;
  name: string;
  parentName: string | null;
  slug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
};

export type SeoUpdate = { id: string; slug: string; metaTitle: string | null; metaDescription: string | null };

export type PlannedRedirect = {
  fromPath: string;
  productId: string | null;
  categoryId: string | null;
  toPath: string | null;
  statusCode: 301 | 410;
};

export type SeoPlan = {
  products: SeoUpdate[];
  categories: SeoUpdate[];
  redirects: PlannedRedirect[];
  /** Слуги, построенные заново (у товара не было ЧПУ): старый адрес → новый слуг */
  generatedSlugs: { externalId: string; name: string; slug: string }[];
  /** Категории старого сайта, которых в ERP нет, и куда ведут их адреса */
  unmatchedCategories: { path: string; name: string; target: string }[];
  problems: string[];
};

/** Страницы, которые на новом сайте остаются по тем же адресам (этап 6 плана). */
export const KEPT_PAGES = new Set(["/", "/kontakty", "/oplata-dostavka", "/privacy"]);

/** Убраны насовсем — 410 (SITE-PRD, «Адреса»). */
export const GONE_PATHS = new Set(["/refubrishment_test"]);

const HOME = "/";

/** Слуг из canonical: `https://bus-com.ru/polki` → `polki`; `index.php?…` → null. */
export function slugFromCanonical(canonical: string | null): string | null {
  if (!canonical) return null;
  const path = oldPath(canonical);
  if (path.includes("?")) return null;
  const segments = path.split("/").filter(Boolean);
  const last = segments.at(-1)?.toLowerCase();
  return last && isValidSlug(last) ? last : null;
}

function rowsBy<K>(rows: OldSnapshotRow[], key: (row: OldSnapshotRow) => K | null): Map<K, OldSnapshotRow[]> {
  const groups = new Map<K, OldSnapshotRow[]>();
  for (const row of rows) {
    const value = key(row);
    if (value === null) continue;
    const list = groups.get(value);
    if (list) list.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

/** Строка с метатегами: та, что лежит по canonical, иначе первая. */
function canonicalRow(rows: OldSnapshotRow[]): OldSnapshotRow {
  const canonical = rows[0].page?.canonical;
  const path = canonical ? oldPath(canonical) : null;
  return rows.find((row) => row.path === path) ?? rows[0];
}

export function planSiteSeo(
  snapshot: OldSnapshotRow[],
  erp: { products: ErpProduct[]; categories: ErpCategory[] },
): SeoPlan {
  const plan: SeoPlan = {
    products: [],
    categories: [],
    redirects: [],
    generatedSlugs: [],
    unmatchedCategories: [],
    problems: [],
  };
  const rows = snapshot.filter((row) => row.status === 200 && row.page);
  for (const row of snapshot.filter((item) => item.status !== 200)) {
    plan.problems.push(`${row.path}: в снимке ответ ${row.status}${row.error ? ` (${row.error})` : ""}`);
  }

  // Занятые слуги — те, что уже в ERP, плюс канонические старого сайта: построенный
  // слуг не должен совпасть ни с одним из них
  const taken = new Set<string>();
  for (const item of [...erp.products, ...erp.categories]) if (item.slug) taken.add(item.slug);
  for (const row of rows) {
    const slug = slugFromCanonical(row.page?.canonical ?? null);
    if (slug) taken.add(slug);
  }
  const redirects = new Map<string, PlannedRedirect>();
  const redirect = (fromPath: string, target: Omit<PlannedRedirect, "fromPath">) => {
    if (!redirects.has(fromPath)) redirects.set(fromPath, { fromPath, ...target });
  };

  // Товары: id OpenCart ↔ Product.externalId
  const productsByExternal = new Map(erp.products.filter((p) => p.externalId).map((p) => [p.externalId as string, p]));
  const productGroups = rowsBy(rows, (row) => (row.page?.kind === "product" ? row.page.opencartId : null));
  const productSlugs = new Map<string, string>();
  for (const [externalId, group] of productGroups) {
    const product = productsByExternal.get(externalId);
    const main = canonicalRow(group);
    if (!product) {
      plan.problems.push(
        `товар OpenCart ${externalId} «${main.page?.h1}» не найден в ERP — его адреса ведут на главную`,
      );
      for (const row of group) redirect(row.path, { productId: null, categoryId: null, toPath: HOME, statusCode: 301 });
      continue;
    }
    let slug = product.slug ?? slugFromCanonical(main.page?.canonical ?? null);
    if (!slug) {
      slug = uniqueSlug(slugify(main.page?.h1 ?? product.name), taken);
      taken.add(slug);
      plan.generatedSlugs.push({ externalId, name: product.name, slug });
    }
    productSlugs.set(product.id, slug);
    plan.products.push({
      id: product.id,
      slug,
      metaTitle: product.metaTitle ?? main.page?.title ?? null,
      metaDescription: product.metaDescription ?? main.page?.description ?? null,
    });
    for (const row of group) {
      if (row.path !== `/${slug}`)
        redirect(row.path, { productId: product.id, categoryId: null, toPath: null, statusCode: 301 });
    }
  }

  // Категории: в ERP нет id OpenCart — сопоставляем по названию (h1 старой страницы)
  // и родителю (последняя крошка)
  const categoryKey = (name: string, parent: string | null) => `${parent ?? ""}\u0000${name}`.toLowerCase();
  const categoriesByKey = new Map(erp.categories.map((c) => [categoryKey(c.name, c.parentName), c]));
  const categoryGroups = rowsBy(rows, (row) =>
    row.page?.kind === "category" ? (row.page.opencartId?.split("_").at(-1) ?? null) : null,
  );
  const matched = new Map<string, ErpCategory>();
  // По короткому адресу OpenCart отдаёт категорию без крошек — родителя берём
  // с того адреса категории, где крошки есть
  const parentOf = (group: OldSnapshotRow[]) =>
    group.map((row) => row.page?.breadcrumbs.at(-1)?.name).find((name) => name !== undefined) ?? null;
  for (const [leafId, group] of categoryGroups) {
    const name = canonicalRow(group).page?.h1 ?? "";
    const category = categoriesByKey.get(categoryKey(name, parentOf(group)));
    if (category) matched.set(leafId, category);
  }
  for (const [leafId, group] of categoryGroups) {
    const main = canonicalRow(group);
    const category = matched.get(leafId);
    if (!category) {
      // Родитель — категория старого сайта с таким же названием, как последняя крошка
      const parentName = parentOf(group);
      const parent = parentName
        ? erp.categories.find((c) => c.name === parentName && c.parentName === null)
        : undefined;
      plan.unmatchedCategories.push({
        path: main.path,
        name: main.page?.h1 ?? main.path,
        target: parent ? `категория «${parent.name}»` : "главная",
      });
      for (const row of group) {
        redirect(row.path, {
          productId: null,
          categoryId: parent?.id ?? null,
          toPath: parent ? null : HOME,
          statusCode: 301,
        });
      }
      continue;
    }
    const slug = category.slug ?? slugFromCanonical(main.page?.canonical ?? null);
    if (!slug) {
      plan.problems.push(`категория «${category.name}»: на старом сайте нет ЧПУ — слуг задать руками`);
      continue;
    }
    plan.categories.push({
      id: category.id,
      slug,
      metaTitle: category.metaTitle ?? main.page?.title ?? null,
      metaDescription: category.metaDescription ?? main.page?.description ?? null,
    });
    for (const row of group) {
      if (row.path !== `/${slug}`)
        redirect(row.path, { productId: null, categoryId: category.id, toPath: null, statusCode: 301 });
    }
  }

  // Всё прочее: статические страницы остаются, мусор — 410, остальное — на главную
  for (const row of rows) {
    const kind = row.page?.kind;
    if (kind === "product" || kind === "category") continue;
    if (KEPT_PAGES.has(row.path)) continue;
    if (GONE_PATHS.has(row.path))
      redirect(row.path, { productId: null, categoryId: null, toPath: null, statusCode: 410 });
    else redirect(row.path, { productId: null, categoryId: null, toPath: HOME, statusCode: 301 });
  }

  // Слуг один на весь сайт: товар и категория с одинаковым адресом не уживутся
  const owners = new Map<string, string>();
  for (const [kind, list] of [
    ["товар", plan.products],
    ["категория", plan.categories],
  ] as const) {
    for (const item of list) {
      const owner = owners.get(item.slug);
      if (owner && owner !== item.id) plan.problems.push(`слуг «${item.slug}» занят дважды (${kind})`);
      owners.set(item.slug, item.id);
    }
  }

  plan.redirects = [...redirects.values()].sort((a, b) => a.fromPath.localeCompare(b.fromPath));
  return plan;
}
