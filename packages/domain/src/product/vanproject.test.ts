import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  availableValues,
  checkSelection,
  describeSelection,
  isVanprojectUrl,
  modificationRequestFields,
  parseModificationPrice,
  parseVanprojectForm,
  parseVanprojectPrice,
} from "./vanproject";

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

// Форма товара со списками вариантов и настоящий ответ сайта на запрос цены —
// «Стекло Mercedes Sprinter Classic XLWB», вариант «заднее / 1845х780мм»
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");
const xlwb = fixture("vanproject-xlwb-form.html");

describe("варианты товара на vanproject.ru", () => {
  it("находит id товара, списки, подписи и зависимости вариантов", () => {
    const form = parseVanprojectForm(xlwb);
    expect(form?.productId).toBe("41");
    expect(form?.options.map((option) => [option.key, option.label, option.values.length])).toEqual([
      ["category", "Расположение", 7],
      ["equipment", "Комплектация", 9],
    ]);
    expect(form?.options[1]?.values[0]).toEqual({
      value: "1180х780мм глухое прозрачное",
      requires: { category: "сдвижной двери" },
    });
  });

  it("товар без вариантов — пустой список, цену берём со страницы", () => {
    const html =
      '<form class="product__settings ms2_form msoptionsprice-product" method="post"><input name="id" hidden value="255">' +
      '<span class="msoptionsprice-cost msoptionsprice-255">330</span></form>';
    expect(parseVanprojectForm(html)).toEqual({ productId: "255", options: [] });
    expect(parseVanprojectForm("<html>нет формы</html>")).toBeNull();
  });

  it("значения второго списка сужаются по первому, повторы схлопываются", () => {
    const options = parseVanprojectForm(xlwb)!.options;
    const equipment = options[1]!;
    expect(availableValues(equipment, { category: "сдвижной двери" })).toEqual([
      "1180х780мм глухое прозрачное",
      "1180х780мм с форточкой прозрачное",
    ]);
    // У «двери задка» левое и правое — один и тот же размер
    expect(availableValues(equipment, {})).toHaveLength(8);
    expect(availableValues(options[0]!, {})).toHaveLength(7);
  });

  it("проверка выбора: всё выбрано и сочетается — можно спрашивать цену", () => {
    const options = parseVanprojectForm(xlwb)!.options;
    expect(checkSelection(options, { category: "заднее", equipment: "1845х780мм глухое прозрачное" })).toEqual({
      ok: true,
    });
    expect(checkSelection(options, { category: "заднее" })).toEqual({ ok: false, error: "Выберите «Комплектация»" });
    expect(checkSelection(options, { category: "заднее", equipment: "1180х780мм глухое прозрачное" })).toEqual({
      ok: false,
      error: "«1180х780мм глухое прозрачное» в списке «Комплектация» не подходит к остальному выбору",
    });
  });

  it("поля запроса — как у формы на сайте", () => {
    expect(modificationRequestFields("41", { category: "заднее", equipment: "1845х780мм глухое прозрачное" })).toEqual([
      ["id", "41"],
      ["count", "1"],
      ["options[category]", "заднее"],
      ["options[equipment]", "1845х780мм глухое прозрачное"],
      ["action", "modification/get"],
      ["ctx", "web"],
    ]);
  });

  it("цена варианта из ответа сайта", () => {
    expect(parseModificationPrice(JSON.parse(fixture("vanproject-modification.json")))).toBe(925_000);
  });

  it("несуществующее сочетание — сайт отдаёт базовую цену с id 0, её не берём", () => {
    const base = { success: true, data: { modification: { id: 0, price: 4450 } } };
    expect(parseModificationPrice(base)).toBeNull();
    expect(parseModificationPrice({ success: false, code: 401 })).toBeNull();
    expect(parseModificationPrice(null)).toBeNull();
    expect(parseModificationPrice({ success: true, data: { modification: { id: 78, price: "0" } } })).toBeNull();
  });

  it("выбор одной строкой — для подсказки у ссылки", () => {
    const options = parseVanprojectForm(xlwb)!.options;
    expect(describeSelection(options, { category: "заднее", equipment: "1845х780мм глухое прозрачное" })).toBe(
      "Расположение: заднее; Комплектация: 1845х780мм глухое прозрачное",
    );
  });
});
