import { describe, expect, it } from "vitest";
import { pageFaq, parsePageText } from "./page-text";
import { resolveSitePage, SITE_PAGE_DEFAULTS, SITE_PAGE_SLUGS, sitePagePath } from "./pages";

describe("исходные тексты страниц", () => {
  it("у каждой страницы есть заголовок и метатеги", () => {
    for (const slug of SITE_PAGE_SLUGS) {
      const page = SITE_PAGE_DEFAULTS[slug];
      expect(page.slug).toBe(slug);
      expect(page.title && page.metaTitle && page.metaDescription).toBeTruthy();
    }
  });

  it("«Оплата и доставка»: два раздела со списками и шесть вопросов с ответами", () => {
    const blocks = parsePageText(SITE_PAGE_DEFAULTS["oplata-dostavka"].body);
    expect(
      blocks.filter((block) => block.kind === "heading").map((block) => block.kind === "heading" && block.text),
    ).toEqual(["Способы доставки", "Способы оплаты", "Частые вопросы"]);
    expect(pageFaq(blocks)).toHaveLength(6);
  });

  it("политика: восемь разделов, только заголовки и списки", () => {
    const blocks = parsePageText(SITE_PAGE_DEFAULTS.privacy.body);
    expect(blocks.filter((block) => block.kind === "heading")).toHaveLength(8);
    expect(blocks.every((block) => block.kind === "heading" || block.kind === "list")).toBe(true);
  });
});

describe("resolveSitePage", () => {
  it("нет строки в базе — исходный текст", () => {
    expect(resolveSitePage("kontakty", null)).toEqual(SITE_PAGE_DEFAULTS.kontakty);
  });

  it("сохранённое перекрывает исходное целиком, пустой description — пустая строка", () => {
    const saved = { title: "Доставка", metaTitle: "T", metaDescription: null, body: "Текст" };
    expect(resolveSitePage("oplata-dostavka", saved)).toEqual({
      slug: "oplata-dostavka",
      ...saved,
      metaDescription: "",
    });
  });
});

describe("главная", () => {
  it("адрес главной — корень, у остальных — ключ", () => {
    expect(sitePagePath("home")).toBe("/");
    expect(sitePagePath("privacy")).toBe("/privacy");
  });

  it("текст о компании: два раздела, абзацы, без ссылки на убранный раздел переоборудования", () => {
    const blocks = parsePageText(SITE_PAGE_DEFAULTS.home.body);
    expect(blocks.filter((block) => block.kind === "heading")).toHaveLength(2);
    expect(blocks.filter((block) => block.kind === "paragraph")).toHaveLength(6);
    expect(SITE_PAGE_DEFAULTS.home.body).not.toContain("соответствующий раздел");
  });
});
