/**
 * Выгрузка каталога с bus-com.ru в JSON — первый шаг переноса товаров в ERP.
 *
 *   pnpm fetch:site-products                 # → misc/site-products.json
 *   pnpm fetch:site-products misc/other.json
 *
 * Скрипт только читает сайт и пишет файл, в базу не ходит. Второй шаг —
 * `pnpm import:site-products`. Разделено нарочно: обход сайта медленный и
 * зависит от сети (сайт может не открываться через VPN), а импорт по готовому
 * файлу повторяется сколько угодно раз.
 *
 * Обход вежливый: запросы по одному с паузой, чтобы не нагружать магазин.
 * Разбор страниц — `src/domain/product/site-catalog.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  parseCatalogMenu,
  parseCategoryProductKeys,
  parseProductPage,
  parseSitemapProductUrls,
  pickCategory,
  productKeyFromUrl,
  type SiteCategory,
  type SiteProduct,
} from "../src/domain/product/site-catalog";

const SITE = "https://bus-com.ru";
const PAUSE_MS = 300;
const out = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "misc/site-products.json";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": "BusCom-ERP catalog sync" } });
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return response.text();
}

export type SiteProductRow = SiteProduct & { category: string | null };

async function main(): Promise<void> {
  console.log(`Сайт: ${SITE}`);

  const menu = parseCatalogMenu(await fetchText(`${SITE}/`));
  console.log(`Категорий в меню: ${menu.length}`);

  // Один адрес на товар: из дублей берём ЧПУ, а не index.php — он стабильнее.
  const byKey = new Map<string, string>();
  for (const url of parseSitemapProductUrls(await fetchText(`${SITE}/sitemap.xml`))) {
    const key = productKeyFromUrl(url);
    if (!byKey.has(key) || byKey.get(key)?.includes("index.php")) byKey.set(key, url);
  }
  console.log(`Адресов товаров (без дублей): ${byKey.size}`);

  const listings: { category: SiteCategory; keys: string[] }[] = [];
  for (const category of menu) {
    const keys = parseCategoryProductKeys(await fetchText(`${category.url}?limit=1000`));
    listings.push({ category, keys });
    await sleep(PAUSE_MS);
  }

  const products = new Map<string, SiteProductRow>();
  const failed: string[] = [];
  let done = 0;
  for (const [key, url] of byKey) {
    done += 1;
    try {
      const product = parseProductPage(await fetchText(url), url);
      // Разные адреса могут оказаться одним товаром — сводим по product_id.
      if (product && !products.has(product.externalId)) {
        products.set(product.externalId, { ...product, category: pickCategory(key, listings) });
      }
      if (!product) failed.push(`${url} — не страница товара`);
    } catch (error) {
      failed.push(`${url} — ${error instanceof Error ? error.message : String(error)}`);
    }
    if (done % 25 === 0 || done === byKey.size) console.log(`  страниц ${done} из ${byKey.size}`);
    await sleep(PAUSE_MS);
  }

  const rows = [...products.values()].sort((a, b) => Number(a.externalId) - Number(b.externalId));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  console.log("");
  console.log(`Товаров: ${rows.length} → ${out}`);
  console.log(`  без категории:   ${rows.filter((row) => !row.category).length}`);
  console.log(`  без артикула:    ${rows.filter((row) => !row.sku).length}`);
  console.log(`  с ценой 0:       ${rows.filter((row) => row.priceKopecks === 0).length}`);
  console.log(`  выключены:       ${rows.filter((row) => !row.isActive).length}`);
  if (failed.length > 0) {
    console.log(`  не прочитано:    ${failed.length}`);
    for (const line of failed) console.log(`    ${line}`);
  }
}

main().catch((error: unknown) => {
  console.error("Выгрузка не выполнена:", error);
  process.exitCode = 1;
});
