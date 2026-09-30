import { describe, expect, it } from "vitest";
import { parsePageText } from "./page-text";
import { blocksToMarkup, markupToBlocks, parseInline, serializeInline, stripInline, type Span } from "./rich-text";

describe("parseInline", () => {
  it("жирный, курсив и жирный курсив", () => {
    expect(parseInline("а **б** в *г* д ***е***")).toEqual([
      { text: "а " },
      { text: "б", bold: true },
      { text: " в " },
      { text: "г", italic: true },
      { text: " д " },
      { text: "е", bold: true, italic: true },
    ]);
  });

  it("подчёркивание: само по себе и вместе с жирным, курсивом и ссылкой", () => {
    expect(parseInline("а __б__ в __**г**__ д [__е__](https://a.ru)")).toEqual([
      { text: "а " },
      { text: "б", underline: true },
      { text: " в " },
      { text: "г", bold: true, underline: true },
      { text: " д " },
      { text: "е", underline: true, href: "https://a.ru" },
    ]);
  });

  it("подчёркивания в артикулах и «___» обычным текстом", () => {
    expect(parseInline("артикул S09_1 и S09__2, ___ и __ ")).toEqual([{ text: "артикул S09_1 и S09__2, ___ и __ " }]);
  });

  it("выделение внутри выделения", () => {
    expect(parseInline("**жирный *и курсив* тут**")).toEqual([
      { text: "жирный ", bold: true },
      { text: "и курсив", bold: true, italic: true },
      { text: " тут", bold: true },
    ]);
  });

  it("ссылка с подписью; подпись может быть выделена", () => {
    expect(parseInline("см. [сайт](https://bus-com.ru/x) и [**важно**](http://a.ru)")).toEqual([
      { text: "см. " },
      { text: "сайт", href: "https://bus-com.ru/x" },
      { text: " и " },
      { text: "важно", bold: true, href: "http://a.ru" },
    ]);
  });

  it("не-http адреса ссылкой не становятся", () => {
    expect(parseInline("[клик](javascript:alert(1))")).toEqual([{ text: "[клик](javascript:alert(1))" }]);
    expect(parseInline("[почта](mailto:a@b.ru)")).toEqual([{ text: "[почта](mailto:a@b.ru)" }]);
  });

  it("звёздочки в обычном тексте остаются: пробелы у границ и середина слова не выделяют", () => {
    expect(parseInline("2 * 3 * 4")).toEqual([{ text: "2 * 3 * 4" }]);
    expect(parseInline("5*3*2 и цена*")).toEqual([{ text: "5*3*2 и цена*" }]);
    expect(parseInline("** пробел **")).toEqual([{ text: "** пробел **" }]);
  });

  it("незакрытое выделение — обычный текст", () => {
    expect(parseInline("**не закрыто")).toEqual([{ text: "**не закрыто" }]);
  });

  it("экранирование: \\* — просто звёздочка", () => {
    expect(parseInline("\\*не курсив\\* и \\[не ссылка\\]")).toEqual([{ text: "*не курсив* и [не ссылка]" }]);
  });
});

describe("serializeInline", () => {
  const roundTrip = (spans: Span[]) => parseInline(serializeInline(spans));

  it("собирает разметку", () => {
    expect(
      serializeInline([
        { text: "а " },
        { text: "б", bold: true },
        { text: " ", bold: false },
        { text: "в", italic: true },
        { text: " ссылка", href: "https://a.ru" },
      ]),
    ).toBe("а **б** *в* [ссылка](https://a.ru)");
  });

  it("соседние куски с одинаковыми отметками склеиваются", () => {
    expect(
      serializeInline([
        { text: "а", bold: true },
        { text: "б", bold: true },
      ]),
    ).toBe("**аб**");
  });

  it("пробелы по краям выделения выносятся наружу", () => {
    expect(serializeInline([{ text: " слово ", bold: true }])).toBe(" **слово** ");
  });

  it("звёздочки и скобки в тексте экранируются и возвращаются как были", () => {
    const spans: Span[] = [{ text: "цена 5*3 [шт] \\" }, { text: "жирно*", bold: true }];
    expect(roundTrip(spans)).toEqual(spans);
  });

  it("не-http ссылка при сборке отбрасывается, пробелы и скобки в адресе кодируются", () => {
    expect(serializeInline([{ text: "x", href: "javascript:alert(1)" }])).toBe("x");
    expect(serializeInline([{ text: "x", href: "https://a.ru/a b(1)" }])).toBe("[x](https://a.ru/a%20b%281%29)");
  });

  it("подчёркивание собирается и возвращается обратно; «__» в тексте экранируется", () => {
    expect(serializeInline([{ text: "слово", underline: true, bold: true }])).toBe("__**слово**__");
    const spans: Span[] = [
      { text: "а__б ", underline: false },
      { text: "в", underline: true },
    ];
    expect(parseInline(serializeInline(spans))).toEqual([{ text: "а__б " }, { text: "в", underline: true }]);
  });

  it("разбор и сборка взаимно обратны", () => {
    const spans: Span[] = [
      { text: "Начало " },
      { text: "жирный", bold: true },
      { text: " и " },
      { text: "оба", bold: true, italic: true },
      { text: " и " },
      { text: "ссылка", href: "https://bus-com.ru/kontakty" },
      { text: " конец" },
    ];
    expect(roundTrip(spans)).toEqual(spans);
  });
});

describe("stripInline", () => {
  it("убирает разметку по строкам, маркеры блоков оставляет", () => {
    expect(stripInline("## **Заголовок**\n• *пункт* и [ссылка](https://a.ru)\nтекст \\* 5")).toBe(
      "## Заголовок\n• пункт и ссылка\nтекст * 5",
    );
  });
});

describe("markupToBlocks / blocksToMarkup", () => {
  const text = [
    "## Заголовок",
    "### Подзаголовок",
    "Абзац с **жирным**.",
    "> цитата",
    "• раз",
    "• два",
    "1. первый",
    "2. второй",
  ].join("\n");

  it("текст разбирается в блоки и собирается обратно без потерь", () => {
    const blocks = markupToBlocks(text);
    expect(blocks.map((block) => block.type)).toEqual([
      "heading",
      "subheading",
      "paragraph",
      "quote",
      "bulletList",
      "orderedList",
    ]);
    expect(blocksToMarkup(blocks)).toBe(text);
  });

  it("старое описание — абзацы и «• » — читается как раньше", () => {
    expect(blocksToMarkup(markupToBlocks("Первый абзац\nВторой абзац\n• пункт\n• ещё"))).toBe(
      "Первый абзац\nВторой абзац\n• пункт\n• ещё",
    );
  });

  it("пустые абзацы и пункты отбрасываются, нумерация идёт заново", () => {
    expect(
      blocksToMarkup([
        { type: "paragraph", spans: [] },
        { type: "orderedList", items: [[{ text: "а" }], [], [{ text: "б" }]] },
        { type: "paragraph", spans: [{ text: "  " }] },
      ]),
    ).toBe("1. а\n2. б");
  });

  it("«? вопрос» и ответ превращаются в обычные абзацы и сохраняются строками", () => {
    expect(blocksToMarkup(markupToBlocks("? Как заказать?\nПозвоните нам."))).toBe("? Как заказать?\nПозвоните нам.");
  });
});

describe("parsePageText: новые блоки", () => {
  it("«### » — подзаголовок, «> » — цитата; «## » по-прежнему заголовок раздела", () => {
    expect(parsePageText("## Раздел\n### Подраздел\n> слова")).toEqual([
      { kind: "heading", text: "Раздел" },
      { kind: "subheading", text: "Подраздел" },
      { kind: "quote", text: "слова" },
    ]);
  });
});
