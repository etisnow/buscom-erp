import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isBuskomplektUrl,
  parseBuskomplektPrice,
  parseBuskomplektProduct,
  suggestBuskomplektSku,
} from "./buskomplekt-product";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseBuskomplektProduct", () => {
  // Отопитель Планар Спутник 9D - 24v (снят 01.10.2026): два снимка, восемь характеристик
  const planar = parseBuskomplektProduct(fixture("buskomplekt-product-planar-9d.html"))!;

  it("название, id на сайте и цена карточки", () => {
    expect(planar.name).toBe("Отопитель Планар Спутник 9D - 24v (Дизель)");
    expect(planar.productId).toBe("694");
    expect(planar.priceKopecks).toBe(5_500_000);
    expect(planar.form).toBeNull();
  });

  it("снимки — оригиналы из ссылок галереи, абсолютные адреса, без уменьшенных копий", () => {
    expect(planar.imageUrls).toEqual([
      "https://buskomplektnn.ru/files/catalog/9D_1.jpg",
      "https://buskomplektnn.ru/files/catalog/9D_2.jpg",
    ]);
  });

  it("путь раздела — без «Главная», «Каталог товаров» и самого товара", () => {
    expect(planar.categoryPath).toEqual(["Климатическое и вентиляционное оборудование", "Отопители Планар"]);
  });

  it("описание — текст под карточкой и характеристики, без разметки, форм и скриптов", () => {
    expect(planar.description).toMatch(/^По габаритным размерам Планар сопоставим/);
    expect(planar.description).toContain("Преимущества воздушных отопителей Планар:");
    expect(planar.description).toContain("Доступная цена");
    expect(planar.description).toContain("Характеристики\n");
    expect(planar.description).toContain("Номинальное напряжение питания, В: 24");
    expect(planar.description).toContain("Масса со всеми комплектующими, кг: не более 14");
    expect(planar.description).not.toMatch(/<[a-z]|Оставить заявку|jQuery|Отправить/i);
    // Блок «Посмотрите похожие предложения» в описание не попадает
    expect(planar.description).not.toContain("Посмотрите похожие");
  });

  it("не карточка товара — null", () => {
    expect(parseBuskomplektProduct("<html><h1>Каталог</h1></html>")).toBeNull();
  });
});

describe("parseBuskomplektPrice", () => {
  it("цена из кнопки корзины; без неё — из подписи «От 55 000,- ₽»", () => {
    expect(parseBuskomplektPrice('<a class="incart_button" id="694@55000">В корзину</a>')).toBe(5_500_000);
    expect(parseBuskomplektPrice('<b class="price">От 29 500 &#8381;</b>')).toBe(2_950_000);
    expect(parseBuskomplektPrice('<b class="price">От 55 000,- ₽</b>')).toBe(5_500_000);
    expect(parseBuskomplektPrice("<p>нет</p>")).toBeNull();
  });
});

describe("isBuskomplektUrl и артикул", () => {
  it("узнаёт сайт по адресу", () => {
    expect(isBuskomplektUrl("https://buskomplektnn.ru/catalog/klimat_i_ventob/otopiteli_planar/x")).toBe(true);
    expect(isBuskomplektUrl("https://evrosid.ru/")).toBe(false);
  });

  it("артикул-подсказка по id", () => {
    expect(suggestBuskomplektSku("694")).toBe("BK-694");
    expect(suggestBuskomplektSku(null)).toBe("");
  });
});
