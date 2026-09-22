import { describe, expect, it } from "vitest";
import { isVanprojectUrl, parseVanprojectPrice } from "@/domain/product/vanproject";

describe("parseVanprojectPrice", () => {
  it("берёт цену из карточки товара", () => {
    // Фрагмент живой страницы «Замок форточки нового образца 38мм»
    const html =
      '<span ><span class="msoptionsprice-cost msoptionsprice-255">330</span><span id="tvcurrency" class="currency"><svg>';
    expect(parseVanprojectPrice(html)).toBe(33000);
  });

  it("разделители разрядов и копейки не ломают разбор", () => {
    expect(parseVanprojectPrice('<span class="msoptionsprice-cost msoptionsprice-7">12 500</span>')).toBe(1250000);
    expect(parseVanprojectPrice('<span class="msoptionsprice-cost msoptionsprice-7">1 234.50</span>')).toBe(123450);
  });

  it("старую цену при скидке не берёт", () => {
    const html =
      '<span class="msoptionsprice-old_cost msoptionsprice-7">900</span>' +
      '<span class="msoptionsprice-cost msoptionsprice-7">700</span>';
    expect(parseVanprojectPrice(html)).toBe(70000);
  });

  it("не находит цену — null, а не исключение", () => {
    expect(parseVanprojectPrice("<html><body>Страница не найдена</body></html>")).toBeNull();
    expect(parseVanprojectPrice('<span class="msoptionsprice-cost msoptionsprice-7">0</span>')).toBeNull();
    expect(parseVanprojectPrice('<span class="msoptionsprice-cost msoptionsprice-7">под заказ</span>')).toBeNull();
    expect(parseVanprojectPrice("")).toBeNull();
  });
});

describe("isVanprojectUrl", () => {
  it("принимает страницы каталога", () => {
    expect(
      isVanprojectUrl(
        "https://vanproject.ru/catalog/stekla-i-steklopakety/zamki-fortochek/zamok-fortochki-novogo-obrazcza-38mm",
      ),
    ).toBe(true);
    expect(isVanprojectUrl("https://www.vanproject.ru/catalog/item")).toBe(true);
  });

  it("проверяет хост, а не вхождение строки", () => {
    expect(isVanprojectUrl("https://vanproject.ru.zloy.site/item")).toBe(false);
    expect(isVanprojectUrl("https://zloy.site/?u=vanproject.ru")).toBe(false);
    expect(isVanprojectUrl("https://avito.ru/item")).toBe(false);
  });
});
