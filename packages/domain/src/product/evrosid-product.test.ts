import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isEvrosidUrl, parseEvrosidPrice, parseEvrosidProduct, suggestEvrosidSku } from "./evrosid-product";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseEvrosidProduct", () => {
  // Сиденье гида С-15.9 (снято 01.10.2026): описания и характеристик на сайте нет
  const guide = parseEvrosidProduct(fixture("evrosid-product-guide.html"))!;

  it("название, id на сайте и цена карточки", () => {
    expect(guide.name).toBe("Сиденье гида С-15.9");
    expect(guide.productId).toBe("743");
    expect(guide.priceKopecks).toBe(3_600_000);
    expect(guide.form).toBeNull();
  });

  it("снимки — из галереи, абсолютные адреса, без повторов и без уменьшенных копий слайдера", () => {
    expect(guide.imageUrls).toHaveLength(6);
    expect(guide.imageUrls[0]).toBe("https://evrosid.ru/upload/iblock/4c2/efqarez8nmihnxvchpatjz4reaubkz5f.jpg");
    expect(guide.imageUrls.every((url) => url.startsWith("https://evrosid.ru/upload/"))).toBe(true);
    expect(guide.imageUrls.some((url) => /80_80|440_380/.test(url))).toBe(false);
  });

  it("«Не указано.» вместо описания — описания нет", () => {
    expect(guide.description).toBeNull();
  });

  it("путь раздела — без «Главная», «Каталог продукции» и названия товара", () => {
    expect(guide.categoryPath).toEqual(["Пассажирские сиденья"]);
  });

  it("описание и преимущества — текстом, без разметки", () => {
    const s131 = parseEvrosidProduct(fixture("evrosid-product-s131.html"))!;
    expect(s131.name).toBe("Сиденье С-13.1");
    expect(s131.description).toMatch(/^Пассажирское сидение С-13\.1 для автобусов/);
    expect(s131.description).toContain("Дополнительные опции");
    expect(s131.description).toContain("Преимущества\nСидение для автобусов городского");
    expect(s131.description).not.toMatch(/<[a-z]/i);
    expect(s131.imageUrls).toHaveLength(7);
    expect(s131.priceKopecks).toBe(576_000);
    expect(s131.productId).toBe("41");
  });

  it("не карточка товара — null", () => {
    expect(parseEvrosidProduct("<html><body>Каталог</body></html>")).toBeNull();
  });
});

describe("parseEvrosidPrice", () => {
  it("цена из разметки; нет цены — null", () => {
    expect(parseEvrosidPrice('<div itemprop="price" content="36000">36000</div>')).toBe(3_600_000);
    expect(parseEvrosidPrice("<p>нет</p>")).toBeNull();
  });
});

describe("isEvrosidUrl и артикул", () => {
  it("узнаёт сайт по адресу", () => {
    expect(isEvrosidUrl("https://evrosid.ru/products/passazhirskie-sidenya/SidenegidaS159/")).toBe(true);
    expect(isEvrosidUrl("https://www.evrosid.ru/products/")).toBe(true);
    expect(isEvrosidUrl("https://vanproject.ru/")).toBe(false);
  });

  it("артикул-подсказка по id", () => {
    expect(suggestEvrosidSku("743")).toBe("ES-743");
    expect(suggestEvrosidSku(null)).toBe("");
  });
});
