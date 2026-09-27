/**
 * Проверка адресов старого сайта на новом (docs/SITE-PLAN.md, этап 8): каждый адрес
 * снимка должен отвечать 200 или вести переадресацией на живую страницу, а у
 * страниц, оставшихся по своему адресу, метатеги — совпадать с эталоном.
 *
 * Здесь только правила; обход — `apps/erp/scripts/check-site-urls.ts`.
 */

export type Hop = { url: string; status: number; location: string | null };

/** Что удалось прочитать на последней странице цепочки */
export type LandedPage = {
  title: string | null;
  description: string | null;
  canonical: string | null;
  /** meta robots и заголовок X-Robots-Tag вместе */
  robots: string | null;
};

export type UrlProbe = { path: string; hops: Hop[]; page: LandedPage | null; error?: string };

/** Эталон из снимка: у страниц, отвечавших 200, — их метатеги */
export type Expected = { path: string; title: string | null; description: string | null };

export type Verdict = { path: string; level: "ok" | "warn" | "fail"; notes: string[] };

/** Адреса, которые убраны намеренно и отвечают 410 (решение владельца, SITE-PRD «Адреса») */
export const GONE_PATHS = new Set(["/refubrishment_test"]);

const MAX_HOPS = 5;

const same = (a: string | null, b: string | null) =>
  (a ?? "").replace(/\s+/g, " ").trim() === (b ?? "").replace(/\s+/g, " ").trim();

const pathOf = (url: string, base: string) => {
  const parsed = new URL(url, base);
  return parsed.pathname + parsed.search;
};

/**
 * `staging` — проверка на временном адресе: там сайт закрыт от индексации
 * (`SITE_INDEXING=false`), и noindex ошибкой не считается.
 */
export function judgeUrl(expected: Expected, probe: UrlProbe, options: { staging: boolean }): Verdict {
  const notes: string[] = [];
  const fail = (note: string): Verdict => ({ path: expected.path, level: "fail", notes: [...notes, note] });

  if (probe.error) return fail(`нет ответа: ${probe.error}`);
  const first = probe.hops[0];
  const last = probe.hops.at(-1);
  if (!first || !last) return fail("нет ответа");

  if (GONE_PATHS.has(expected.path)) {
    return last.status === 410 && probe.hops.length === 1
      ? { path: expected.path, level: "ok", notes: ["410 — убран намеренно"] }
      : fail(`ожидался 410, ответ ${last.status}`);
  }

  for (const hop of probe.hops.slice(0, -1)) {
    // 302 и 307 поисковик не считает переездом — вес старого адреса не перейдёт
    if (hop.status !== 301 && hop.status !== 308) return fail(`переадресация ${hop.status}, нужна 301`);
  }
  if (probe.hops.length > MAX_HOPS) return fail(`цепочка переадресаций длиннее ${MAX_HOPS}`);
  if (last.status >= 300 && last.status < 400)
    return fail(`переадресация никуда не привела: ${last.location ?? "без адреса"}`);
  if (last.status !== 200) {
    return fail(
      probe.hops.length > 1 ? `ведёт на ${pathOf(last.url, first.url)} — ответ ${last.status}` : `ответ ${last.status}`,
    );
  }
  if (probe.hops.length > 2) notes.push(`переадресаций подряд: ${probe.hops.length - 1}`);

  const page = probe.page;
  if (page?.robots && /noindex/i.test(page.robots) && !options.staging) {
    return fail(`закрыта от индексации (${page.robots})`);
  }

  // Метатеги сверяем только у страниц, оставшихся по своему адресу (дубли уходят 301),
  // и только если в эталоне они были: старый сайт мог ответить на адрес переадресацией
  const hadMeta = expected.title !== null || expected.description !== null;
  if (probe.hops.length === 1 && page && hadMeta) {
    const canonical = page.canonical ? pathOf(page.canonical, first.url) : null;
    if (canonical !== null && canonical !== expected.path) notes.push(`canonical ведёт на ${canonical}`);
    if (expected.title !== null && !same(page.title, expected.title))
      notes.push(`title: «${page.title ?? ""}», было «${expected.title ?? ""}»`);
    if (expected.description !== null && !same(page.description, expected.description))
      notes.push("description отличается от прежнего");
  }

  return { path: expected.path, level: notes.length > 0 ? "warn" : "ok", notes };
}
