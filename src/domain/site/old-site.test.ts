import { describe, expect, it } from "vitest";
import { oldPath, parseOldPage, parseSitemapEntries } from "./old-site";

describe("карта старого сайта", () => {
  it("все записи по порядку, &amp; раскодирован, повторы убраны", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://bus-com.ru/klei</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
      <url><loc>https://bus-com.ru/index.php?route=product/product&amp;product_id=470</loc><priority>1.0</priority></url>
      <url><loc>https://bus-com.ru/index.php?route=product/product&amp;product_id=470</loc><priority>1.0</priority></url>
      <url><loc>https://bus-com.ru/detali-salona/polki</loc><priority>0.7</priority></url>
    </urlset>`;
    expect(parseSitemapEntries(xml)).toEqual([
      { url: "https://bus-com.ru/klei", priority: "1.0" },
      { url: "https://bus-com.ru/index.php?route=product/product&product_id=470", priority: "1.0" },
      { url: "https://bus-com.ru/detali-salona/polki", priority: "0.7" },
    ]);
  });

  it("путь — ключ переадресации: со строкой запроса, без хвостового слэша, кириллица раскодирована", () => {
    expect(oldPath("https://bus-com.ru/index.php?route=product/product&amp;product_id=470")).toBe(
      "/index.php?route=product/product&product_id=470",
    );
    expect(oldPath("https://bus-com.ru/detali-salona/polki/")).toBe("/detali-salona/polki");
    expect(oldPath("https://bus-com.ru/")).toBe("/");
    expect(oldPath("https://bus-com.ru/%D0%BA%D0%BB%D0%B5%D0%B9")).toBe("/клей");
  });
});

describe("страница старого сайта", () => {
  const head = (extra: string) => `<!DOCTYPE html><html><head>
    <title>Клей для ткани в салон микроавтобуса купить</title>
    <meta name="description" content="Клей &laquo;для ткани&raquo;" />
    <meta name='yandex-verification' content='5849b7bce8a74991' />
    ${extra}
  </head>`;

  it("товар: id из класса body, метатеги дословно, canonical, h1", () => {
    const page = parseOldPage(`${head(`<link href="https://bus-com.ru/klei" rel="canonical" />`)}
      <body class="product-product-319"><h1>Клей для ткани 1 кг</h1>
      <script type="application/ld+json">{ "@type": "BreadcrumbList", "itemListElement": [{ "@type": "ListItem",
        "position": 1, "item": { "@id": "https://bus-com.ru/", "name": "Баском" } }] }</script></body></html>`);
    expect(page).toMatchObject({
      kind: "product",
      opencartId: "319",
      title: "Клей для ткани в салон микроавтобуса купить",
      description: "Клей «для ткани»",
      keywords: null,
      canonical: "https://bus-com.ru/klei",
      h1: "Клей для ткани 1 кг",
      breadcrumbs: [],
      contentHtml: null,
    });
  });

  it("категория: путь OpenCart, крошки из ld+json без главной", () => {
    const page = parseOldPage(`${head(`<link rel="canonical" href="https://bus-com.ru/polki">`)}
      <body class="product-category-80_62"><h1>Полки</h1>
      <script type="application/ld+json">{ "@type": "BreadcrumbList", "itemListElement": [
        { "@type": "ListItem", "position": 1, "item": { "@id": "https://bus-com.ru/", "name": "Баском" } },
        { "@type": "ListItem", "position": 2, "item": { "@id": "https://bus-com.ru/detali-salona", "name": "Детали салона" } }] }
      </script></body>`);
    expect(page).toMatchObject({
      kind: "category",
      opencartId: "80_62",
      canonical: "https://bus-com.ru/polki",
      breadcrumbs: [{ name: "Детали салона", url: "https://bus-com.ru/detali-salona" }],
    });
  });

  it("производитель без h1 и description", () => {
    const page = parseOldPage(`<title>Webasto (Германия)</title><body class="product-manufacturer-info-16"></body>`);
    expect(page).toMatchObject({ kind: "manufacturer", opencartId: "16", h1: null, description: null });
  });

  it("статическая страница: текст после h1 без форм, комментариев и микроразметки", () => {
    const page = parseOldPage(`${head("")}<body class="information-information"><div id="content">
      <h1>Оплата и доставка</h1>
      <p>1. Самовывоз<br>2. Доставка ТК</p>
      <!-- <form>старое</form> -->
      <form action="/x"><input name="q"></form>
      <div class="contact" itemscope="" itemtype="http://schema.org/Organization"><h4>ИНН: 5261111427</h4></div>
      <span itemscope itemtype="http://schema.org/NewsArticle"><meta itemprop="name" content="Баском" /></span>
      </div><footer>подвал</footer></body>`);
    expect(page.kind).toBe("information");
    expect(page.contentHtml).toContain("<p>1. Самовывоз<br>2. Доставка ТК</p>");
    expect(page.contentHtml).toContain("ИНН: 5261111427");
    expect(page.contentHtml).not.toMatch(/form|NewsArticle|подвал/);
    expect(page.contentText).toContain("Самовывоз");
  });

  it("главная и незнакомый тип", () => {
    expect(parseOldPage(`<body class="common-home"><h1>Баском</h1><p>Здравствуйте</p><footer></footer>`)).toMatchObject(
      {
        kind: "home",
        h1: "Баском",
      },
    );
    expect(parseOldPage(`<body class="error-not_found"></body>`).kind).toBe("other");
  });
});
