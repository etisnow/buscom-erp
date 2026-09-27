import { describe, expect, it } from "vitest";
import { pageFaq, parsePageText } from "./page-text";

describe("parsePageText", () => {
  it("заголовки, абзацы, маркированные и нумерованные списки", () => {
    const text = [
      "## Способы доставки",
      "1. Самовывоз",
      "2) Транспортной компанией",
      "Стоимость считает ТК.",
      "• Россия",
      "- Беларусь",
    ].join("\n");
    expect(parsePageText(text)).toEqual([
      { kind: "heading", text: "Способы доставки" },
      { kind: "list", ordered: true, items: ["Самовывоз", "Транспортной компанией"] },
      { kind: "paragraph", text: "Стоимость считает ТК." },
      { kind: "list", ordered: false, items: ["Россия", "Беларусь"] },
    ]);
  });

  it("вопросы подряд — один блок, ответ из нескольких строк склеивается", () => {
    const text = "? Входит ли доставка?\nНет.\nОплачиваете ТК.\n\n? Можно самовывоз?\nДа.";
    expect(parsePageText(text)).toEqual([
      {
        kind: "faq",
        items: [
          { question: "Входит ли доставка?", answer: "Нет. Оплачиваете ТК." },
          { question: "Можно самовывоз?", answer: "Да." },
        ],
      },
    ]);
  });

  it("после пустой строки ответ кончается — дальше обычный абзац", () => {
    expect(parsePageText("? Вопрос\nОтвет\n\nАбзац").at(-1)).toEqual({ kind: "paragraph", text: "Абзац" });
  });

  it("список другого вида начинает новый список; переводы строк Windows", () => {
    expect(parsePageText("• а\r\n1. б").map((block) => block.kind === "list" && block.ordered)).toEqual([false, true]);
  });

  it("строка «-10%» без пробела — абзац, а не пункт", () => {
    expect(parsePageText("-10% на второй заказ")).toEqual([{ kind: "paragraph", text: "-10% на второй заказ" }]);
  });

  it("пустой текст — пустая страница", () => {
    expect(parsePageText(" \n \n")).toEqual([]);
  });
});

describe("pageFaq", () => {
  it("только вопросы с ответом, из всех блоков", () => {
    const blocks = parsePageText("? Первый\nОтвет\n\nТекст\n\n? Без ответа\n\n? Третий\nДа");
    expect(pageFaq(blocks)).toEqual([
      { question: "Первый", answer: "Ответ" },
      { question: "Третий", answer: "Да" },
    ]);
  });
});
