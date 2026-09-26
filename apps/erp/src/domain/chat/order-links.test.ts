import { describe, expect, it } from "vitest";
import { orderNumbersIn, splitOrderLinks } from "@/domain/chat/order-links";

describe("splitOrderLinks", () => {
  it("находит №, № с пробелом и #", () => {
    expect(splitOrderLinks("см. №3021, № 3016 и #7")).toEqual([
      { type: "text", text: "см. " },
      { type: "order", text: "№3021", number: 3021 },
      { type: "text", text: ", " },
      { type: "order", text: "№ 3016", number: 3016 },
      { type: "text", text: " и " },
      { type: "order", text: "#7", number: 7 },
    ]);
  });

  it("текст без номеров — один кусок", () => {
    expect(splitOrderLinks("привет")).toEqual([{ type: "text", text: "привет" }]);
    expect(splitOrderLinks("")).toEqual([]);
  });

  it("решётка внутри слова и число без знака — не ссылка", () => {
    expect(orderNumbersIn("abc#12 заказ 3021 C#")).toEqual([]);
  });

  it("слишком длинное число не режется на кусок", () => {
    expect(orderNumbersIn("#1234567890")).toEqual([]);
  });

  it("номер в начале строки и после скобки", () => {
    expect(orderNumbersIn("#5 (№6)")).toEqual([5, 6]);
  });
});

describe("orderNumbersIn", () => {
  it("без повторов", () => {
    expect(orderNumbersIn("#3021 и снова №3021")).toEqual([3021]);
  });
});
