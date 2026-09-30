import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isGruppaDetaleyUrl,
  parseGruppaDetaleyPrice,
  parseGruppaDetaleyProduct,
  suggestGruppaDetaleySku,
} from "./gruppa-detaley-product";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseGruppaDetaleyProduct", () => {
  // Сиденье водителя ПАЗ Вектор NEXT (снято 01.10.2026): один снимок, описания нет
  const seat = parseGruppaDetaleyProduct(fixture("gruppa-detaley-product-sidene-voditelya.html"))!;

  it("название, номер на сайте и цена карточки", () => {
    expect(seat.name).toBe("Сиденье водителя (ПАЗ Вектор NEXT, БК, мех. сис. подрес. с подголов., ткань, 3х точ. РБ)");
    expect(seat.productId).toBe("709");
    expect(seat.priceKopecks).toBe(7_293_500);
    expect(seat.form).toBeNull();
  });

  it("описания нет — только артикул поставщика", () => {
    expect(seat.description).toBe("Артикул поставщика: B2912-6800220-00");
  });

  it("снимок один (на странице он повторён), адрес абсолютный, не уменьшенная копия", () => {
    expect(seat.imageUrls).toHaveLength(1);
    expect(seat.imageUrls[0]).toMatch(/^https:\/\/gruppa-detaley\.ru\/file\/watermark\/.+\.wm\.jpg$/);
    expect(seat.imageUrls[0]).not.toContain("/thumb.");
  });

  it("путь раздела — без главной, «Каталог запчастей» и самого товара", () => {
    expect(seat.categoryPath).toEqual(["Сиденья водителя"]);
  });

  it("не карточка товара — null", () => {
    expect(parseGruppaDetaleyProduct("<html><h1>Каталог</h1></html>")).toBeNull();
  });
});

describe("parseGruppaDetaleyPrice", () => {
  it("цена из itemprop; нет цены — null", () => {
    expect(parseGruppaDetaleyPrice('<span itemprop="price"> 72935</span> руб.')).toBe(7_293_500);
    expect(parseGruppaDetaleyPrice("<p>нет</p>")).toBeNull();
  });
});

describe("isGruppaDetaleyUrl и артикул", () => {
  it("узнаёт сайт по адресу", () => {
    expect(isGruppaDetaleyUrl("https://gruppa-detaley.ru/catalog/x_709.html")).toBe(true);
    expect(isGruppaDetaleyUrl("https://tehprestige.ru/")).toBe(false);
  });

  it("артикул-подсказка по номеру", () => {
    expect(suggestGruppaDetaleySku("709")).toBe("GD-709");
    expect(suggestGruppaDetaleySku(null)).toBe("");
  });
});
