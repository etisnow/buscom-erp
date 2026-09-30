import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isTehprestigeUrl,
  parseTehprestigePrice,
  parseTehprestigeProduct,
  suggestTehprestigeSku,
} from "./tehprestige-product";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseTehprestigeProduct", () => {
  // Сиденье пассажирское раскладное ТП06 (снято 01.10.2026): четыре снимка, описания нет
  const seat = parseTehprestigeProduct(fixture("tehprestige-product-sidene.html"))!;

  it("название, номер на сайте и цена карточки", () => {
    expect(seat.name).toBe("Сиденье пассажирское раскладное ТП06");
    expect(seat.productId).toBe("6134");
    expect(seat.priceKopecks).toBe(865_000);
    expect(seat.form).toBeNull();
  });

  it("описания нет — только артикул поставщика, рекламный текст магазина не берём", () => {
    expect(seat.description).toBe("Артикул поставщика: ТП06-6830010");
  });

  it("снимки — ссылки галереи на полноразмерные файлы, абсолютные адреса, без уменьшенных копий", () => {
    expect(seat.imageUrls).toHaveLength(4);
    expect(seat.imageUrls.every((url) => url.startsWith("https://tehprestige.ru/file/watermark/"))).toBe(true);
    expect(seat.imageUrls.every((url) => url.endsWith(".wm.jpg") && !url.includes("/thumb."))).toBe(true);
  });

  it("путь раздела — без главной и самого товара", () => {
    expect(seat.categoryPath).toEqual(["Сиденья", "Пассажирские сиденья"]);
  });

  it("не карточка товара — null", () => {
    expect(parseTehprestigeProduct("<html><h1>Каталог</h1></html>")).toBeNull();
  });
});

describe("parseTehprestigePrice", () => {
  it("цена из data-price; без неё — из itemprop со значением «8 650,00»", () => {
    expect(parseTehprestigePrice('<span class="value" data-price="8650">8&nbsp;650,00</span>')).toBe(865_000);
    expect(parseTehprestigePrice('<meta itemprop="price" content="8&nbsp;650,00">')).toBe(865_000);
    expect(parseTehprestigePrice("<p>нет</p>")).toBeNull();
  });
});

describe("isTehprestigeUrl и артикул", () => {
  it("узнаёт сайт по адресу", () => {
    expect(isTehprestigeUrl("https://tehprestige.ru/catalog/passazhirskie-sidenya/x_50.html")).toBe(true);
    expect(isTehprestigeUrl("https://gruppa-detaley.ru/")).toBe(false);
  });

  it("артикул-подсказка по номеру", () => {
    expect(suggestTehprestigeSku("6134")).toBe("TP-6134");
    expect(suggestTehprestigeSku(null)).toBe("");
  });
});
