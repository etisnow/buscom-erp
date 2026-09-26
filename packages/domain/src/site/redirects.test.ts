import { describe, expect, it } from "vitest";
import { redirectKeys, redirectLocation } from "./redirects";
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
