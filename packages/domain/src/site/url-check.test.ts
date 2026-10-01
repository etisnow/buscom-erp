import { describe, expect, it } from "vitest";
import { judgeUrl, type Expected, type Hop, type LandedPage } from "./url-check";

const BASE = "https://new.bus-com.ru";
const expected: Expected = { path: "/polki", title: "Полки для микроавтобусов", description: "Купить полки" };
const page: LandedPage = {
  title: "Полки для микроавтобусов",
  description: "Купить  полки ",
  canonical: "https://bus-com.ru/polki",
  robots: null,
};
const hop = (path: string, status: number, location: string | null = null): Hop => ({
  url: `${BASE}${path}`,
  status,
  location,
});
const judge = (probe: { hops: Hop[]; page?: LandedPage | null; error?: string }, target = expected, staging = false) =>
  judgeUrl(target, { path: target.path, page: null, ...probe }, { staging });

describe("judgeUrl", () => {
  it("страница на своём адресе с прежними метатегами — ok (пробелы не в счёт)", () => {
    expect(judge({ hops: [hop("/polki", 200)], page })).toEqual({ path: "/polki", level: "ok", notes: [] });
  });

  it("301 на живую страницу — ok, метатеги дубля не сверяются", () => {
    const verdict = judge(
      { hops: [hop("/detali-salona/polki", 301, "/polki"), hop("/polki", 200)], page: { ...page, title: "другое" } },
      { ...expected, path: "/detali-salona/polki" },
    );
    expect(verdict.level).toBe("ok");
  });

  it("404, 500 и переадресация в никуда — провал", () => {
    expect(judge({ hops: [hop("/polki", 404)] })).toMatchObject({ level: "fail", notes: ["ответ 404"] });
    expect(judge({ hops: [hop("/polki", 301, "/nowhere"), hop("/nowhere", 404)] })).toMatchObject({
      level: "fail",
      notes: ["ведёт на /nowhere — ответ 404"],
    });
    expect(judge({ hops: [hop("/polki", 500)] }).level).toBe("fail");
  });

  it("302 вместо 301 — провал: вес адреса не переедет", () => {
    expect(judge({ hops: [hop("/polki", 302, "/x"), hop("/x", 200)], page }).notes).toEqual([
      "переадресация 302, нужна 301",
    ]);
  });

  it("цепочка обрезана на переадресации — провал", () => {
    expect(judge({ hops: [hop("/a", 301, "/b"), hop("/b", 301, "/c")] }).level).toBe("fail");
  });

  it("намеренно убранный адрес — 410, другой ответ — провал", () => {
    const gone = { path: "/refubrishment_test", title: null, description: null };
    expect(judge({ hops: [hop("/refubrishment_test", 410)] }, gone).level).toBe("ok");
    expect(judge({ hops: [hop("/refubrishment_test", 404)] }, gone).level).toBe("fail");
  });

  it("noindex — провал на боевом адресе и норма на временном", () => {
    const hidden = { ...page, robots: "noindex, nofollow" };
    expect(judge({ hops: [hop("/polki", 200)], page: hidden }).level).toBe("fail");
    expect(judge({ hops: [hop("/polki", 200)], page: hidden }, expected, true).level).toBe("ok");
  });

  it("старый поисковый адрес, ведущий на закрытую страницу поиска, — не провал", () => {
    const search: Expected = { path: "/index.php?route=product/search&search=stf2", title: null, description: null };
    const hidden = { ...page, robots: "noindex, follow" };
    const hops = [hop(search.path, 301, "/poisk?q=stf2"), hop("/poisk?q=stf2", 200)];
    expect(judge({ hops, page: hidden }, search).level).toBe("ok");
    expect(
      judge(
        { hops: [hop("/index.php?route=checkout/cart", 301, "/korzina"), hop("/korzina", 200)], page: hidden },
        search,
      ).level,
    ).toBe("ok");
  });

  it("другой title, description или canonical — предупреждение, не провал", () => {
    const verdict = judge({
      hops: [hop("/polki", 200)],
      page: { ...page, title: "Полки", description: "Новое", canonical: "/drugoe" },
    });
    expect(verdict.level).toBe("warn");
    expect(verdict.notes).toEqual([
      "canonical ведёт на /drugoe",
      "title: «Полки», было «Полки для микроавтобусов»",
      "description отличается от прежнего",
    ]);
  });

  it("у эталона не было метатегов — сверять нечего", () => {
    const bare = { path: "/polki", title: null, description: null };
    expect(judge({ hops: [hop("/polki", 200)], page }, bare).level).toBe("ok");
  });

  it("нет ответа — провал с причиной", () => {
    expect(judge({ hops: [], error: "ECONNRESET" }).notes).toEqual(["нет ответа: ECONNRESET"]);
  });
});

describe("judgeUrl: поле, которого в эталоне не было", () => {
  it("description по шаблону там, где старого не было, — не предупреждение", () => {
    const noDescription = { ...expected, description: null };
    expect(judge({ hops: [hop("/polki", 200)], page: { ...page, description: "Шаблон" } }, noDescription).level).toBe(
      "ok",
    );
  });
});
