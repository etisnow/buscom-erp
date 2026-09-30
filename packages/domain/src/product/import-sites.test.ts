import { describe, expect, it } from "vitest";
import { isBuskomplektUrl } from "./buskomplekt-product";
import { isEvrosidUrl } from "./evrosid-product";
import { isGruppaDetaleyUrl } from "./gruppa-detaley-product";
import { detectImportSite, IMPORT_SITES, looksLikeLink } from "./import-sites";
import { isTehprestigeUrl } from "./tehprestige-product";
import { isVanprojectUrl } from "./vanproject";

describe("detectImportSite", () => {
  it("узнаёт сайт по ссылке, в том числе без https:// и с www", () => {
    expect(detectImportSite("https://evrosid.ru/products/passazhirskie-sidenya/SidenegidaS159/")?.name).toBe("ЕвроСид");
    expect(detectImportSite("tehprestige.ru/catalog/x_50.html")?.name).toBe("Техпрестиж");
    expect(detectImportSite("  https://www.vanproject.ru/catalog/steklo/xlwb ")?.name).toBe("Фургон Проект");
  });

  it("чужой сайт, похожее имя и пустое поле — null", () => {
    expect(detectImportSite("https://avito.ru/x")).toBeNull();
    expect(detectImportSite("https://evrosid.ru.zloy.site/x")).toBeNull();
    expect(detectImportSite("")).toBeNull();
    expect(detectImportSite("просто текст")).toBeNull();
  });

  it("список сайтов согласован с проверками адреса в парсерах", () => {
    const checks: Record<string, (url: string) => boolean> = {
      "vanproject.ru": isVanprojectUrl,
      "evrosid.ru": isEvrosidUrl,
      "buskomplektnn.ru": isBuskomplektUrl,
      "tehprestige.ru": isTehprestigeUrl,
      "gruppa-detaley.ru": isGruppaDetaleyUrl,
    };
    expect(IMPORT_SITES.map((site) => site.host).sort()).toEqual(Object.keys(checks).sort());
    for (const site of IMPORT_SITES) expect(checks[site.host](`https://${site.host}/x`)).toBe(true);
  });
});

describe("looksLikeLink", () => {
  it("ссылка с https:// или без, но не слова", () => {
    expect(looksLikeLink("https://site.ru/x")).toBe(true);
    expect(looksLikeLink("site.ru/x")).toBe(true);
    expect(looksLikeLink("отопитель планар")).toBe(false);
    expect(looksLikeLink("https:")).toBe(false);
    expect(looksLikeLink("")).toBe(false);
  });
});
