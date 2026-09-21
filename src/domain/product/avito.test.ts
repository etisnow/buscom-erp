import { describe, expect, it } from "vitest";
import { isAvitoUrl, parseAvitoPrice } from "@/domain/product/avito";

describe("parseAvitoPrice", () => {
  it("берёт цену из микроразметки", () => {
    expect(parseAvitoPrice('<meta itemprop="price" content="2450">')).toBe(245000);
  });

  it("читает микроразметку и при обратном порядке атрибутов", () => {
    expect(parseAvitoPrice('<meta content="2450" itemprop="price">')).toBe(245000);
  });

  it("берёт цену из служебного атрибута вёрстки", () => {
    expect(parseAvitoPrice('<span data-marker="item-view/item-price" content="880">880 ₽</span>')).toBe(88000);
  });

  it("берёт цену из JSON гидратации", () => {
    expect(parseAvitoPrice('{"priceDetailed":{"value":1290,"currency":"RUB"}}')).toBe(129000);
  });

  it("разделители разрядов не ломают разбор", () => {
    expect(parseAvitoPrice('<meta itemprop="price" content="1 234 567">')).toBe(123456700);
    // Неразрывный пробел — именно он приходит из вёрстки
    expect(parseAvitoPrice('<meta itemprop="price" content="12 500">')).toBe(1250000);
  });

  it("копейки через запятую и точку", () => {
    expect(parseAvitoPrice('<meta itemprop="price" content="1234,50">')).toBe(123450);
    expect(parseAvitoPrice('<meta itemprop="price" content="1234.50">')).toBe(123450);
  });

  it("первый признак важнее запасных", () => {
    const html = '<meta itemprop="price" content="100"><span data-marker="item-view/item-price" content="999">';
    expect(parseAvitoPrice(html)).toBe(10000);
  });

  it("переходит к следующему признаку, если первый дал мусор", () => {
    const html = '<meta itemprop="price" content="0"><span data-marker="item-view/item-price" content="700">';
    expect(parseAvitoPrice(html)).toBe(70000);
  });

  it("не находит цену — null, а не исключение", () => {
    expect(parseAvitoPrice("<html><body>Объявление снято с публикации</body></html>")).toBeNull();
    expect(parseAvitoPrice("")).toBeNull();
  });

  it("бессмысленные значения отбрасывает", () => {
    expect(parseAvitoPrice('<meta itemprop="price" content="0">')).toBeNull();
    expect(parseAvitoPrice('<meta itemprop="price" content="-100">')).toBeNull();
    expect(parseAvitoPrice('<meta itemprop="price" content="договорная">')).toBeNull();
    expect(parseAvitoPrice('<meta itemprop="price" content="999999999">')).toBeNull();
  });
});

describe("isAvitoUrl", () => {
  it("принимает объявления Авито", () => {
    expect(isAvitoUrl("https://www.avito.ru/nizhniy_novgorod/zapchasti/zamok_123")).toBe(true);
    expect(isAvitoUrl("https://avito.ru/item")).toBe(true);
    expect(isAvitoUrl("https://m.avito.ru/item")).toBe(true);
  });

  it("проверяет хост, а не вхождение строки", () => {
    expect(isAvitoUrl("https://avito.ru.zloy.site/item")).toBe(false);
    expect(isAvitoUrl("https://zloy.site/?u=avito.ru")).toBe(false);
    expect(isAvitoUrl("https://notavito.ru/item")).toBe(false);
  });

  it("отклоняет чужие сайты и мусор", () => {
    expect(isAvitoUrl("https://prime-avto.ru/catalog/sk24")).toBe(false);
    expect(isAvitoUrl("не ссылка")).toBe(false);
    expect(isAvitoUrl("")).toBe(false);
  });

  it("отклоняет посторонние схемы", () => {
    expect(isAvitoUrl("file:///etc/passwd")).toBe(false);
    expect(isAvitoUrl("ftp://avito.ru/item")).toBe(false);
  });
});
