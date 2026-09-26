import { decodeEntities, htmlToText } from "@/domain/product/site-catalog";

/**
 * Снимок SEO старого bus-com.ru (OpenCart) — этап 2 плана сайта (`docs/SITE-PLAN.md`).
 *
 * С живого сайта до переключения снимаются адреса из `sitemap.xml` и то, что
 * на них написано руками: title, description, canonical, h1, хлебные крошки,
 * тексты страниц. Потом взять это будет неоткуда — выключенный OpenCart ничего
 * не отдаст. Из снимка заполняются слуги, метатеги и таблица переадресаций.
 *
 * Тип страницы и id в OpenCart берутся из класса `<body>`: тема пишет туда
 * маршрут и параметр — `product-product-470`, `product-category-80_62`,
 * `product-manufacturer-info-16`, `information-information`, `common-home`.
 */

export type OldSitemapEntry = {
  /** Адрес как в карте, с раскодированным `&amp;` */
  url: string;
  priority: string;
};

export type OldPageKind = "home" | "product" | "category" | "manufacturer" | "information" | "other";

export type OldBreadcrumb = { name: string; url: string };

export type OldPage = {
  kind: OldPageKind;
  /** id в OpenCart: товара, производителя; у категории — путь `80_62` */
  opencartId: string | null;
  title: string | null;
  description: string | null;
  keywords: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string | null;
  /** Без главной — она у всех первая */
  breadcrumbs: OldBreadcrumb[];
  /** Текст страницы — только у главной и статических: у них он написан руками */
  contentHtml: string | null;
  contentText: string | null;
};

/** Все записи карты сайта по порядку, повторы убраны (в карте OpenCart они есть). */
export function parseSitemapEntries(xml: string): OldSitemapEntry[] {
  const seen = new Set<string>();
  const entries: OldSitemapEntry[] = [];
  for (const [entry] of xml.matchAll(/<url>[\s\S]*?<\/url>/g)) {
    const loc = entry.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) continue;
    const url = decodeEntities(loc.trim());
    if (seen.has(url)) continue;
    seen.add(url);
    entries.push({ url, priority: entry.match(/<priority>([^<]+)<\/priority>/)?.[1]?.trim() ?? "" });
  }
  return entries;
}

/**
 * Путь со строкой запроса — ключ переадресации: `/detali-salona/polki`,
 * `/index.php?route=product/product&product_id=470`. Кириллица в пути
 * раскодирована, хвостовой слэш убран (кроме корня).
 */
export function oldPath(rawUrl: string): string {
  const url = new URL(decodeEntities(rawUrl));
  let path = decodeURIComponent(url.pathname);
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return `${path}${url.search}`;
}

function clean(value: string | undefined): string | null {
  if (value === undefined) return null;
  const text = decodeEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return text || null;
}

/** Атрибут `content` у `<meta name="…">` — в любом порядке атрибутов и с любыми кавычками. */
function meta(html: string, name: string): string | null {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map(
      [...tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => [m[1].toLowerCase(), m[2] ?? m[3]]),
    );
    if (attrs.get("name")?.toLowerCase() === name) return clean(attrs.get("content"));
  }
  return null;
}

function canonical(html: string): string | null {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']canonical["']/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) return decodeEntities(href.trim());
  }
  return null;
}

function kindOf(bodyClass: string): { kind: OldPageKind; opencartId: string | null } {
  const product = bodyClass.match(/\bproduct-product-(\d+)/);
  if (product) return { kind: "product", opencartId: product[1] };
  const category = bodyClass.match(/\bproduct-category-([\d_]+)/);
  if (category) return { kind: "category", opencartId: category[1] };
  const manufacturer = bodyClass.match(/\bproduct-manufacturer-info-(\d+)/);
  if (manufacturer) return { kind: "manufacturer", opencartId: manufacturer[1] };
  if (/\binformation-information\b/.test(bodyClass)) return { kind: "information", opencartId: null };
  if (/\bcommon-home\b/.test(bodyClass)) return { kind: "home", opencartId: null };
  return { kind: "other", opencartId: null };
}

/** Крошки из `BreadcrumbList` в ld+json — там они полные, с адресами. Главная отбрасывается. */
function breadcrumbs(html: string): OldBreadcrumb[] {
  for (const [, json] of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    if (!/"BreadcrumbList"/.test(json)) continue;
    return [...json.matchAll(/"@id"\s*:\s*"([^"]+)"\s*,\s*"name"\s*:\s*"([^"]*)"/g)]
      .map((m) => ({ url: decodeEntities(m[1]), name: clean(m[2]) ?? "" }))
      .filter((crumb) => new URL(crumb.url).pathname !== "/");
  }
  return [];
}

/**
 * Текст страницы после `h1` до подвала: скрипты, комментарии, формы и служебная
 * микроразметка отброшены. Разметку не чистим — это снимок «как было», из него
 * потом переносят тексты руками или скриптом.
 */
function content(html: string): string | null {
  const start = html.search(/<\/h1>/i);
  if (start < 0) return null;
  const end = html.search(/<footer\b/i);
  const cut = html
    .slice(start + 5, end > start ? end : undefined)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<form[\s\S]*?<\/form>/gi, "");
  // Тема дописывает в конец статьи служебную микроразметку NewsArticle — это не
  // текст. Другие `itemscope` оставляем: в «Контактах» ими размечен сам текст
  const article = cut.search(/<(span|div)\b[^>]*\bitemscope\b[^>]*schema\.org\/NewsArticle/i);
  const body = (article >= 0 ? cut.slice(0, article) : cut).trim();
  return body || null;
}

export function parseOldPage(html: string): OldPage {
  const bodyClass = html.match(/<body\b[^>]*class\s*=\s*["']([^"']*)["']/i)?.[1] ?? "";
  const { kind, opencartId } = kindOf(bodyClass);
  const withText = kind === "home" || kind === "information";
  const contentHtml = withText ? content(html) : null;
  return {
    kind,
    opencartId,
    title: clean(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]),
    description: meta(html, "description"),
    keywords: meta(html, "keywords"),
    canonical: canonical(html),
    robots: meta(html, "robots"),
    h1: clean(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]),
    breadcrumbs: breadcrumbs(html),
    contentHtml,
    contentText: contentHtml ? htmlToText(contentHtml) : null,
  };
}
