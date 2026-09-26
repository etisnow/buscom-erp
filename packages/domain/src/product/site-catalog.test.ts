import { describe, expect, it } from "vitest";
import {
  assignSkus,
  parseCatalogMenu,
  parseCategoryProductKeys,
  parseProductDescription,
  parseProductImages,
  parseProductOptions,
  parseProductPage,
  parseSitemapProductUrls,
  pickCategoryPath,
  productKeyFromUrl,
  uniqueOptionNames,
} from "./site-catalog";

describe("sitemap сайта", () => {
  const xml = `<?xml version="1.0"?><urlset>
    <url><loc>https://bus-com.ru/klei</loc><priority>1.0</priority><image:image></image:image></url>
    <url><loc>https://bus-com.ru/russia/klei</loc><priority>1.0</priority></url>
    <url><loc>https://bus-com.ru/index.php?route=product/product&amp;product_id=470</loc><priority>1.0</priority></url>
    <url><loc>https://bus-com.ru/detali-salona</loc><priority>0.7</priority></url>
    <url><loc>https://bus-com.ru/kontakty</loc><priority>0.5</priority></url>
  </urlset>`;

  it("берёт только товары (приоритет 1.0) и раскодирует &amp;", () => {
    expect(parseSitemapProductUrls(xml)).toEqual([
      "https://bus-com.ru/klei",
      "https://bus-com.ru/russia/klei",
      "https://bus-com.ru/index.php?route=product/product&product_id=470",
    ]);
  });

  it("один товар под разными разделами даёт один ключ, index.php — ключ по product_id", () => {
    expect(productKeyFromUrl("https://bus-com.ru/klei")).toBe("klei");
    expect(productKeyFromUrl("https://bus-com.ru/russia/klei?limit=1000")).toBe("klei");
    expect(productKeyFromUrl("https://bus-com.ru/index.php?route=product/product&amp;product_id=470")).toBe("id:470");
  });
});

describe("меню и листинги категорий", () => {
  const home = `<nav><div><ul class="nav navbar-nav">
    <li class="dropdown"><a href="https://bus-com.ru/detali-salona">Детали салона</a>
      <div class="dropdown-menu"><ul>
        <li><a href="https://bus-com.ru/detali-salona/polki">Полки</a></li>
        <li><a href="https://bus-com.ru/detali-salona/poruchni">Поручни</a></li>
      </ul><a href="https://bus-com.ru/detali-salona" class="see-all">Показать все</a></div></li>
    <li class="dropdown"><a href="https://bus-com.ru/klimat">Климат</a>
      <div class="dropdown-menu"><ul><li><a href="https://bus-com.ru/klimat/ljuki">Люки</a></li></ul></div></li>
    <li><a href="https://bus-com.ru/kontakty">Контакты</a></li>
  </ul></div></nav>`;

  it("разбирает разделы и подкатегории, «Показать все» и чужие ссылки пропускает", () => {
    expect(parseCatalogMenu(home).map((item) => [item.name, item.parentUrl !== null])).toEqual([
      ["Детали салона", false],
      ["Полки", true],
      ["Поручни", true],
      ["Климат", false],
      ["Люки", true],
    ]);
  });

  it("ключи товаров из листинга, без повторов", () => {
    const html = `<h4><a href="https://bus-com.ru/detali-salona/polki/polka-1?limit=1000">П1</a></h4>
      <h4><a href="https://bus-com.ru/detali-salona/polki/polka-1">П1</a></h4>
      <h4><a href="https://bus-com.ru/index.php?route=product/product&amp;product_id=357">П2</a></h4>`;
    expect(parseCategoryProductKeys(html)).toEqual(["polka-1", "id:357"]);
  });

  it("путь категории — раздел и подкатегория, без подкатегории — только раздел; иначе пусто", () => {
    const root = { url: "r", name: "Детали салона", parentUrl: null };
    const child = { url: "r/p", name: "Полки", parentUrl: "r" };
    const listings = [
      { category: root, keys: ["polka-1", "kovrik"] },
      { category: child, keys: ["polka-1"] },
    ];
    expect(pickCategoryPath("polka-1", listings)).toEqual(["Детали салона", "Полки"]);
    expect(pickCategoryPath("kovrik", listings)).toEqual(["Детали салона"]);
    expect(pickCategoryPath("podium", listings)).toEqual([]);
  });
});

describe("страница товара", () => {
  const debug = (product: object) =>
    `<script>console.log('php_array: ${JSON.stringify(product)}');</script><script>console.log('php_array: [{"product_id":"1"}]');</script>`;

  it("читает отладочный объект: id, название, артикул, цену в копейках, статус", () => {
    const html = debug({
      product_id: "386",
      name: "Эко-кожа Премиум",
      model: "KO03",
      price: 1790,
      status: "1",
      manufacturer: "Россия",
    });
    expect(parseProductPage(html, "u")).toEqual({
      externalId: "386",
      url: "u",
      name: "Эко-кожа Премиум",
      sku: "KO03",
      priceKopecks: 179_000,
      isActive: true,
      manufacturer: "Россия",
      description: null,
      options: [],
      images: [],
    });
  });

  it("дробная цена и выключенный товар", () => {
    const html = debug({ product_id: "5", name: "Болт", model: "B1", price: "12.50", status: "0" });
    expect(parseProductPage(html, "u")).toMatchObject({ priceKopecks: 1250, isActive: false });
  });

  it("без отладки берёт то же из разметки", () => {
    const html = `<h1>Клей для ткани 1 кг</h1>
      <li>Производитель: <!-- <a href="x"> -->Россия<!-- </a> --></li>
      <li>Код товара: PR16</li>
      <h2 id="price-now" price="1 790 руб.">1 790 руб.</h2>
      <input type="hidden" name="product_id" value="319" />`;
    expect(parseProductPage(html, "u")).toMatchObject({
      externalId: "319",
      name: "Клей для ткани 1 кг",
      sku: "PR16",
      priceKopecks: 179_000,
      manufacturer: "Россия",
    });
  });

  it("не страница товара — null", () => {
    expect(parseProductPage("<h1>Товар не найден!</h1>", "u")).toBeNull();
  });
});

describe("артикулы для ERP", () => {
  it("повтор на сайте — первый по product_id как есть, остальные с суффиксом", () => {
    const skus = assignSkus([
      { externalId: "441", sku: "SHT02" },
      { externalId: "440", sku: "SHT02" },
      { externalId: "12", sku: "" },
    ]);
    expect(Object.fromEntries(skus)).toEqual({ "12": "BC-12", "440": "SHT02", "441": "SHT02-441" });
  });

  it("артикул, занятый в ERP другим товаром, тоже получает суффикс", () => {
    const skus = assignSkus([{ externalId: "7", sku: "ST-3M-GAZ" }], new Set(["ST-3M-GAZ"]));
    expect(skus.get("7")).toBe("ST-3M-GAZ-7");
  });
});

describe("опции товара на сайте", () => {
  const html = `<h3>Доступные опции</h3>
    <div class="options form-group required" style="width:100%">
      <label class="control-label" for="input-option360">Выбор стекла Ford Transit LWB</label>
      <select name="option[360]" id="input-option360" class="form-control">
        <option value=""> --- Пожалуйста, выберите --- </option>
        <option value="731 " price="12 250 руб." >1) Боковое переднее левое (с форточкой) 1428х630     (+12 250 руб.)
        </option>
        <option value="732 " price="4 750 руб." >2) Боковое переднее левое 1428х630     (+4 750 руб.)
        </option>
      </select>
    </div>
    <div class="options form-group" quantity="1" option_name="Ремень">
      <label class="control-label">Ремень</label>
      <div class="radio"><label>
        <input type="radio" priceRaw="0" price="" name="option[339]" value="582"  checked />
        Нет      </label></div>
      <div class="radio"><label>
        <input type="radio" priceRaw="1750" price="1 750 руб." name="option[339]" value="584"  />
        Трехточечный      (+1 750 руб.)
      </label></div>
    </div>
    <div class="options form-group required" quantity="1" option_name="Цвет">
      <label class="control-label">Цвет</label>
      <div class="radio"><label>
        <input type="radio" priceRaw="0" price="" name="option[400]" value="700" />
        <img src="https://bus-com.ru/image/cache/beige-50x50.jpg" alt="Бежевый" class="img-thumbnail" /> Бежевый
      </label></div>
    </div>
    <div class="options form-group">
      <label class="control-label" for="input-option274">Номер цвета</label>
      <input type="text" name="option[274]" value="" class="form-control" />
    </div>
    <button type="button" id="button-cart">В корзину</button>`;

  it("список и радиокнопки — группы с надбавками, текстовое поле пропускается", () => {
    expect(parseProductOptions(html)).toEqual([
      {
        externalId: "360",
        name: "Выбор стекла Ford Transit LWB",
        required: true,
        values: [
          { externalId: "731", name: "1) Боковое переднее левое (с форточкой) 1428х630", priceDeltaKopecks: 1_225_000 },
          { externalId: "732", name: "2) Боковое переднее левое 1428х630", priceDeltaKopecks: 475_000 },
        ],
      },
      {
        externalId: "339",
        name: "Ремень",
        required: false,
        values: [
          { externalId: "582", name: "Нет", priceDeltaKopecks: 0 },
          { externalId: "584", name: "Трехточечный", priceDeltaKopecks: 175_000 },
        ],
      },
      {
        // Вариант-плашка: превью <img> в названии не остаётся
        externalId: "400",
        name: "Цвет",
        required: true,
        values: [{ externalId: "700", name: "Бежевый", priceDeltaKopecks: 0 }],
      },
    ]);
  });

  it("у товара без блока опций — пусто", () => {
    expect(parseProductOptions("<h1>Клей</h1>")).toEqual([]);
  });

  it("повторы названий получают номер, иначе ERP отклонила бы товар", () => {
    const [group] = uniqueOptionNames([
      {
        externalId: "1",
        name: "Цвет",
        required: false,
        values: [
          { externalId: "a", name: "Серый", priceDeltaKopecks: 0 },
          { externalId: "b", name: "серый", priceDeltaKopecks: 0 },
        ],
      },
    ]);
    expect(group.values.map((value) => value.name)).toEqual(["Серый", "серый (2)"]);
  });
});

describe("описание товара на сайте", () => {
  it("абзацы и списки становятся текстом, мусор Word'а выбрасывается", () => {
    const html = `<div class="tab-content"><div class="tab-pane active" id="tab-description">
      <p class="MsoNormal">Линолеум антискользящий.<o:p></o:p></p>
      <div style="text-align: left;">Ширина рулона&nbsp;&mdash; 2&nbsp;м.<br>Цена за м&sup2;.</div>
      <ul><li class="MsoNormal">толщина 2.5&nbsp;мм</li><li>простой монтаж</li></ul>
      </div><div class="buttons">Купить</div></div>`;
    expect(parseProductDescription(html)).toBe(
      "Линолеум антискользящий.\n\nШирина рулона — 2 м.\nЦена за м².\n\n• толщина 2.5 мм\n• простой монтаж",
    );
  });

  it("вложенные div не обрывают описание, скрипт в текст не попадает", () => {
    const html = `<div class="tab-pane active" id="tab-description"><div>Первый<div>вложенный</div></div>
      <script>alert(1)</script><p>Второй</p></div><div>Чужое</div>`;
    expect(parseProductDescription(html)).toBe("Первый\nвложенный\n\nВторой");
  });

  it("пустое описание и его отсутствие — null", () => {
    expect(parseProductDescription(`<div id="tab-description"><p><br></p><p>&nbsp;</p></div>`)).toBeNull();
    expect(parseProductDescription("<h1>Клей</h1>")).toBeNull();
  });

  it("на странице товара описание попадает в карточку", () => {
    const html = `<h1>Клей</h1><input type="hidden" name="product_id" value="319" />
      <div id="tab-description"><p>Клей для ткани.</p></div>`;
    expect(parseProductPage(html, "u")?.description).toBe("Клей для ткани.");
  });
});

describe("картинки товара на сайте", () => {
  it("главная — первой, с превью 228×228; у дополнительных превью 74×74", () => {
    const html = `<ul class="thumbnails">
      <li><a class="thumbnail" href="https://bus-com.ru/image/cache/a-1000x1000-product_popup.jpg" title="А"><img src="https://bus-com.ru/image/cache/a-228x228-product_thumb.jpg" /></a></li>
      <li class="image-additional"><a class="thumbnail" href="https://bus-com.ru/image/cache/b-1000x1000-product_popup.jpg" title="А"> <img src="https://bus-com.ru/image/cache/b-74x74-product_popup.jpg" /></a></li>
    </ul>`;
    expect(parseProductImages(html)).toEqual([
      {
        url: "https://bus-com.ru/image/cache/a-1000x1000-product_popup.jpg",
        thumbUrl: "https://bus-com.ru/image/cache/a-228x228-product_thumb.jpg",
      },
      {
        url: "https://bus-com.ru/image/cache/b-1000x1000-product_popup.jpg",
        thumbUrl: "https://bus-com.ru/image/cache/b-74x74-product_popup.jpg",
      },
    ]);
  });

  it("без блока картинок — пусто", () => {
    expect(parseProductImages("<h1>Клей</h1>")).toEqual([]);
  });
});
