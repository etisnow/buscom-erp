import { describe, expect, it } from "vitest";
import { canonicalOrigin, fallbackLocation, redirectKeys, redirectLocation } from "./redirects";
import { startingPrice } from "./pricing";

describe("ключи переадресации", () => {
  it("путь без хвостового слэша и без строки запроса, кириллица раскодирована", () => {
    expect(redirectKeys("/detali-salona/polki/", "")).toEqual(["/detali-salona/polki"]);
    expect(redirectKeys("/detali-salona/polki", "?limit=25&page=2")).toEqual(["/detali-salona/polki"]);
    expect(redirectKeys("/%D0%BA%D0%BB%D0%B5%D0%B9", "")).toEqual(["/клей"]);
    expect(redirectKeys("/", "")).toEqual(["/"]);
  });

  it("регистр: сначала как есть, потом в нижнем", () => {
    expect(redirectKeys("/Russia/Klei", "")).toEqual(["/Russia/Klei", "/russia/klei"]);
  });

  it("index.php — по product_id, порядок параметров не важен", () => {
    const key = "/index.php?route=product/product&product_id=470";
    expect(redirectKeys("/index.php", "?route=product/product&product_id=470")).toEqual([key]);
    expect(redirectKeys("/index.php", "?product_id=470&route=product/product&path=80")).toEqual([key]);
    expect(redirectKeys("/index.php", "?route=common/home")).toEqual([]);
    expect(redirectKeys("/index.php", "?route=product/product&product_id=abc")).toEqual([]);
  });

  it("битая кодировка пути не роняет разбор", () => {
    expect(redirectKeys("/%E0%A4%A", "")).toEqual(["/%E0%A4%A", "/%e0%a4%a"]);
  });

  it("цель: товар, категория, путь, а без цели — главная", () => {
    const base = { statusCode: 301 as const, productSlug: null, categorySlug: null, toPath: null };
    expect(redirectLocation({ ...base, productSlug: "klei" })).toBe("/klei");
    expect(redirectLocation({ ...base, categorySlug: "polki" })).toBe("/polki");
    expect(redirectLocation({ ...base, toPath: "/kontakty" })).toBe("/kontakty");
    expect(redirectLocation(base)).toBe("/");
  });
});

describe("запасная переадресация (адреса из индекса вне карты сайта)", () => {
  const slugs = new Set(["podlokotnik-reguliruemiy-2", "komplektuyshie-dlya-sidenij", "sidenja-dlya-microavtobusov"]);
  const table = new Map([
    ["/russia", "/"],
    ["/stekla", "/detali-kuzova-mikroavtobusa"],
  ]);
  const resolve = (path: string, search = "") =>
    fallbackLocation(
      path,
      search,
      (slug) => slugs.has(slug),
      (key) => table.get(key) ?? null,
    );

  it("товар под чужим разделом — на товар", () => {
    expect(resolve("/komplektuyshie-dlya-sidenij/podlokotnik-reguliruemiy-2")).toBe("/podlokotnik-reguliruemiy-2");
    expect(resolve("/Sidenja-I-Komplektuyshie/Podlokotnik-Reguliruemiy-2/")).toBe("/podlokotnik-reguliruemiy-2");
  });

  it("товара больше нет — на ближайший известный раздел из пути", () => {
    expect(resolve("/sidenja-i-komplektuyshie/komplektuyshie-dlya-sidenij/chehol-dlya-sidenja")).toBe(
      "/komplektuyshie-dlya-sidenij",
    );
    expect(resolve("/stekla/zamok-ushel")).toBe("/detali-kuzova-mikroavtobusa");
    expect(resolve("/russia/otopitel-oc7")).toBe("/");
  });

  it("неизвестный путь и одиночный сегмент — 404", () => {
    expect(resolve("/otopitel-oc7")).toBeNull();
    expect(resolve("/wp-login.php")).toBeNull();
    expect(resolve("/foo/bar")).toBeNull();
  });

  it("собственные вложенные маршруты сайта не трогает", () => {
    expect(resolve("/modeli/ford-transit/sidenja-dlya-microavtobusov")).toBeNull();
    expect(resolve("/img/salon/podlokotnik-reguliruemiy-2")).toBeNull();
  });

  it("index.php: поиск — на наш поиск, корзина — на корзину, прочее — на главную", () => {
    expect(resolve("/index.php", "?route=product/search&search=%D1%81%D1%82%D0%B5%D0%BA%D0%BB%D0%BE")).toBe(
      "/poisk?q=%D1%81%D1%82%D0%B5%D0%BA%D0%BB%D0%BE",
    );
    expect(resolve("/index.php", "?route=product/search")).toBe("/poisk");
    expect(resolve("/index.php", "?route=checkout/cart")).toBe("/korzina");
    expect(resolve("/index.php", "?route=feed/google_sitemap")).toBe("/sitemap.xml");
    expect(resolve("/index.php", "?route=feed/yandex_sitemap")).toBe("/sitemap.xml");
    expect(resolve("/index.php", "?route=feed/imagemap")).toBe("/sitemap.xml");
    expect(resolve("/index.php", "?route=account/login")).toBe("/");
    expect(resolve("/index.php", "")).toBe("/");
  });

  it("index.php с product_id решает таблица, не запасное правило", () => {
    expect(resolve("/index.php", "?route=product/product&product_id=429")).toBeNull();
  });
});

describe("канонический адрес: https и без www", () => {
  it("http и www ведутся одним переходом на https без www", () => {
    expect(canonicalOrigin("http", "bus-com.ru")).toBe("https://bus-com.ru");
    expect(canonicalOrigin("https", "www.bus-com.ru")).toBe("https://bus-com.ru");
    expect(canonicalOrigin("http", "www.new.bus-com.ru")).toBe("https://new.bus-com.ru");
  });

  it("канонический запрос и локальный dev не трогает", () => {
    expect(canonicalOrigin("https", "bus-com.ru")).toBeNull();
    expect(canonicalOrigin(null, "bus-com.ru")).toBeNull();
    expect(canonicalOrigin("http", "localhost:3001")).toBeNull();
    expect(canonicalOrigin("http", null)).toBeNull();
  });
});

describe("цена «от»", () => {
  it("без опций — базовая, без «от»", () => {
    expect(startingPrice(100_000, [])).toEqual({ priceKopecks: 100_000, hasChoice: false });
  });

  it("обязательная группа прибавляет самый дешёвый вариант, выбор — «от»", () => {
    const groups = [{ required: true, values: [{ priceDeltaKopecks: 500_000 }, { priceDeltaKopecks: 700_000 }] }];
    expect(startingPrice(0, groups)).toEqual({ priceKopecks: 500_000, hasChoice: true });
  });

  it("необязательная надбавка цену не поднимает, но даёт «от»", () => {
    const groups = [{ required: false, values: [{ priceDeltaKopecks: 0 }, { priceDeltaKopecks: 150_000 }] }];
    expect(startingPrice(100_000, groups)).toEqual({ priceKopecks: 100_000, hasChoice: true });
  });

  it("группа с одинаковыми вариантами — не выбор цены", () => {
    const groups = [{ required: true, values: [{ priceDeltaKopecks: 0 }, { priceDeltaKopecks: 0 }] }];
    expect(startingPrice(100_000, groups)).toEqual({ priceKopecks: 100_000, hasChoice: false });
  });
});
