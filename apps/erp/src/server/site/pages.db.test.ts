import { beforeEach, expect, it } from "vitest";
import { SITE_PAGE_DEFAULTS } from "@buscom/domain/site/pages";
import { listSitePages, resetSitePage, saveSitePage } from "@/server/site/pages";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

const draft = {
  title: "Доставка",
  metaTitle: "Доставка | Баском",
  metaDescription: " ",
  body: "## Раздел   \n\n\n\nТекст  ",
};

describeDb("страницы сайта (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  it("без правок — исходные тексты всех страниц", async () => {
    const pages = await listSitePages();
    expect(pages.map((page) => page.slug)).toEqual(["home", "oplata-dostavka", "kontakty", "privacy"]);
    expect(pages.every((page) => !page.edited)).toBe(true);
    expect(pages[1].body).toBe(SITE_PAGE_DEFAULTS["oplata-dostavka"].body);
  });

  it("сохранение пишет строку с автором, текст подчищен; повтор — обновляет", async () => {
    await saveSitePage("oplata-dostavka", draft, manager);
    expect(await testDb.sitePage.findUniqueOrThrow({ where: { slug: "oplata-dostavka" } })).toMatchObject({
      title: "Доставка",
      metaDescription: null,
      body: "## Раздел\n\nТекст",
      updatedById: manager.id,
    });

    await saveSitePage("oplata-dostavka", { ...draft, body: "Новый" }, manager);
    const page = (await listSitePages()).find((row) => row.slug === "oplata-dostavka");
    expect(page).toMatchObject({ edited: true, body: "Новый", updatedByName: expect.any(String) });
    expect(await testDb.sitePage.count()).toBe(1);
  });

  it("сброс возвращает исходный текст", async () => {
    await saveSitePage("privacy", draft, manager);
    await resetSitePage("privacy", manager);
    const privacy = (await listSitePages()).find((page) => page.slug === "privacy");
    expect(privacy).toMatchObject({ edited: false, body: SITE_PAGE_DEFAULTS.privacy.body });
  });
});
