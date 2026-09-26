/**
 * Снимок SEO старого bus-com.ru — эталон для переноса адресов и метатегов
 * (этап 2, `docs/SITE-PLAN.md`).
 *
 *   pnpm snapshot:old-site                        # → docs/site-snapshot/ в корне репозитория
 *   pnpm snapshot:old-site docs/site-snapshot-2
 *
 * Обходит каждый адрес из `sitemap.xml` и каждый canonical, которого в карте нет
 * (у категорий канонический адрес короткий, а в карте — путь с разделом).
 * Переадресации не проходит, а записывает: код и куда. Кладёт рядом исходную
 * карту как есть — по ней после переключения проверяется, что ни один старый
 * адрес не отдаёт 404. В базу не ходит.
 *
 * Обход вежливый: по одному запросу с паузой. Разбор — `src/domain/site/old-site.ts`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { oldPath, parseOldPage, parseSitemapEntries } from "../src/domain/site/old-site";
import type { OldSnapshotRow as SnapshotRow } from "../src/domain/site/seo-import";

const SITE = "https://bus-com.ru";
const PAUSE_MS = 300;
const outDir = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "../../docs/site-snapshot";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function snapshot(url: string): Promise<Pick<SnapshotRow, "status" | "location" | "page" | "error">> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { redirect: "manual", headers: { "User-Agent": "BusCom site snapshot" } });
      const location = response.headers.get("location");
      const html = response.status === 200 ? await response.text() : null;
      return { status: response.status, location, page: html ? parseOldPage(html) : null };
    } catch (error) {
      // Сеть до сайта нестабильна (VPN) — два повтора, потом строка с ошибкой
      if (attempt >= 3) {
        return { status: 0, location: null, page: null, error: error instanceof Error ? error.message : String(error) };
      }
      await sleep(2000 * attempt);
    }
  }
}

async function main(): Promise<void> {
  const response = await fetch(`${SITE}/sitemap.xml`);
  if (!response.ok) throw new Error(`sitemap.xml → HTTP ${response.status}`);
  const xml = await response.text();
  const entries = parseSitemapEntries(xml);
  console.log(`Сайт: ${SITE}, адресов в карте: ${entries.length}`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "sitemap.xml"), xml, "utf8");

  const rows: SnapshotRow[] = [];
  const known = new Set<string>();
  const queue: { url: string; source: SnapshotRow["source"]; priority: string | null }[] = entries.map((entry) => ({
    url: entry.url,
    source: "sitemap",
    priority: entry.priority,
  }));
  // Главной в карте OpenCart нет, а у неё свои метатеги и SEO-текст
  if (!entries.some((entry) => oldPath(entry.url) === "/")) {
    queue.unshift({ url: `${SITE}/`, source: "extra", priority: null });
  }
  for (const entry of queue) known.add(oldPath(entry.url));

  for (let i = 0; i < queue.length; i++) {
    const { url, source, priority } = queue[i];
    const result = await snapshot(url);
    rows.push({ path: oldPath(url), url, source, priority, ...result });

    const canonical = result.page?.canonical;
    if (canonical && new URL(canonical).host === new URL(SITE).host && !known.has(oldPath(canonical))) {
      known.add(oldPath(canonical));
      queue.push({ url: canonical, source: "canonical", priority: null });
    }
    if ((i + 1) % 50 === 0 || i + 1 === queue.length) console.log(`  страниц ${i + 1} из ${queue.length}`);
    await sleep(PAUSE_MS);
  }

  writeFileSync(join(outDir, "pages.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");

  const count = (predicate: (row: SnapshotRow) => boolean) => rows.filter(predicate).length;
  console.log("");
  console.log(`Снимок: ${rows.length} адресов → ${outDir}`);
  for (const kind of ["product", "category", "manufacturer", "information", "home", "other"] as const) {
    console.log(`  ${kind.padEnd(13)} ${count((row) => row.page?.kind === kind)}`);
  }
  console.log(`  из canonical  ${count((row) => row.source === "canonical")}`);
  console.log(`  не 200        ${count((row) => row.status !== 200)}`);
  for (const row of rows.filter((item) => item.status !== 200)) {
    console.log(
      `    ${row.status} ${row.path}${row.location ? ` → ${row.location}` : ""}${row.error ? ` (${row.error})` : ""}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error("Снимок не снят:", error);
  process.exitCode = 1;
});
