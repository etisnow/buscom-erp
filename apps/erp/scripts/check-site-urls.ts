/**
 * Обход всех адресов снимка старого bus-com.ru на новом сайте (этап 8,
 * `docs/SITE-PLAN.md`). Гоняется до переключения на временном адресе и ещё раз
 * после — на боевом.
 *
 *   pnpm check:site-urls https://new.bus-com.ru --staging   # временный адрес, noindex не ошибка
 *   pnpm check:site-urls https://bus-com.ru                  # после переключения DNS
 *   pnpm check:site-urls http://localhost:3001 --staging --report=misc/local.md
 *
 * Каждый адрес: цепочка переадресаций проходится вручную (до 6 шагов), код каждого
 * шага записывается. Правила — `packages/domain/src/site/url-check.ts`. Итог —
 * сводка в консоль и отчёт Markdown в `misc/url-check.md` (провалы и предупреждения поимённо).
 * Код выхода 1 — есть провалы. В базу не ходит.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseOldPage } from "@buscom/domain/site/old-site";
import type { OldSnapshotRow } from "@buscom/domain/site/seo-import";
import { judgeUrl, type Hop, type UrlProbe, type Verdict } from "@buscom/domain/site/url-check";

const args = process.argv.slice(2);
const base = (args.find((arg) => !arg.startsWith("--")) ?? "https://bus-com.ru").replace(/\/$/, "");
const staging = args.includes("--staging");
const snapshotPath =
  args.find((arg) => arg.startsWith("--snapshot="))?.slice("--snapshot=".length) ??
  "../../docs/site-snapshot/pages.json";
const reportPath = args.find((arg) => arg.startsWith("--report="))?.slice("--report=".length) ?? "misc/url-check.md";

const CONCURRENCY = 4;
const MAX_STEPS = 6;

async function probe(path: string): Promise<UrlProbe> {
  const hops: Hop[] = [];
  let url = base + path;
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "BusCom URL check" },
        signal: AbortSignal.timeout(20_000),
      });
      const location = response.headers.get("location");
      hops.push({ url, status: response.status, location });
      if (response.status >= 300 && response.status < 400 && location) {
        url = new URL(location, url).toString();
        continue;
      }
      if (response.status !== 200) return { path, hops, page: null };
      const parsed = parseOldPage(await response.text());
      const header = response.headers.get("x-robots-tag");
      const robots = [parsed.robots, header].filter(Boolean).join(", ") || null;
      return {
        path,
        hops,
        page: { title: parsed.title, description: parsed.description, canonical: parsed.canonical, robots },
      };
    }
    return { path, hops, page: null };
  } catch (error) {
    return { path, hops, page: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function main() {
  const rows = JSON.parse(readFileSync(snapshotPath, "utf8")) as OldSnapshotRow[];
  console.log(`Проверяем ${rows.length} адресов на ${base}${staging ? " (временный адрес: noindex допустим)" : ""}`);

  const verdicts: Verdict[] = new Array(rows.length);
  let next = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < rows.length) {
        const index = next++;
        const row = rows[index];
        const expected = {
          path: row.path,
          title: row.status === 200 ? (row.page?.title ?? null) : null,
          description: row.status === 200 ? (row.page?.description ?? null) : null,
        };
        verdicts[index] = judgeUrl(expected, await probe(row.path), { staging });
        if (++done % 100 === 0) console.log(`  ${done} / ${rows.length}`);
      }
    }),
  );

  const failed = verdicts.filter((verdict) => verdict.level === "fail");
  const warned = verdicts.filter((verdict) => verdict.level === "warn");
  const summary = `Всего ${verdicts.length}: ok ${verdicts.length - failed.length - warned.length}, предупреждений ${warned.length}, провалов ${failed.length}`;
  const section = (title: string, list: Verdict[]) =>
    list.length === 0 ? [] : [`## ${title}`, "", ...list.map((v) => `- \`${v.path}\` — ${v.notes.join("; ")}`), ""];
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(
    reportPath,
    [
      `# Обход адресов старого сайта: ${base}`,
      "",
      `${new Date().toISOString()} · снимок \`${snapshotPath}\`${staging ? " · временный адрес" : ""}`,
      "",
      summary,
      "",
      ...section("Провалы", failed),
      ...section("Предупреждения", warned),
    ].join("\n"),
  );
  console.log(summary);
  for (const verdict of failed.slice(0, 20)) console.log(`  ✗ ${verdict.path} — ${verdict.notes.join("; ")}`);
  console.log(`Отчёт: ${reportPath}`);
  process.exitCode = failed.length > 0 ? 1 : 0;
}

void main();
