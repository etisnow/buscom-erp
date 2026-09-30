import { describe, expect, it } from "vitest";
import { orderNumbersIn, splitOrderLinks } from "./order-links";

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

describe("ссылки-адреса в тексте", () => {
  const links = (text: string) => splitOrderLinks(text).filter((segment) => segment.type === "link");

  it("находит https://, http:// и www., у www. дописывает https://", () => {
    expect(links("тут https://bus-com.ru/kontakty, а тут http://a.ru и www.example.com/x")).toEqual([
      { type: "link", text: "https://bus-com.ru/kontakty", href: "https://bus-com.ru/kontakty" },
      { type: "link", text: "http://a.ru", href: "http://a.ru" },
      { type: "link", text: "www.example.com/x", href: "https://www.example.com/x" },
    ]);
  });

  it("знаки препинания и закрывающая скобка после адреса в ссылку не входят", () => {
    expect(links("см. https://a.ru/b.")[0]).toMatchObject({ text: "https://a.ru/b" });
    expect(links("(см. https://a.ru/b)")[0]).toMatchObject({ text: "https://a.ru/b" });
    expect(links("Ссылка: https://a.ru/b?x=1!»")[0]).toMatchObject({ text: "https://a.ru/b?x=1" });
  });

  it("скобка, которая есть в самом адресе, остаётся", () => {
    expect(links("https://ru.wikipedia.org/wiki/Транзит_(фильм)")[0]).toMatchObject({
      text: "https://ru.wikipedia.org/wiki/Транзит_(фильм)",
    });
  });

  it("«#3021» внутри адреса — часть адреса, а не номер заказа", () => {
    expect(orderNumbersIn("https://a.ru/page#3021 и №5")).toEqual([5]);
    expect(splitOrderLinks("https://a.ru/page#3021")).toEqual([
      { type: "link", text: "https://a.ru/page#3021", href: "https://a.ru/page#3021" },
    ]);
  });

  it("номера заказов рядом с адресом находятся по-прежнему", () => {
    expect(splitOrderLinks("№7 https://a.ru")).toEqual([
      { type: "order", text: "№7", number: 7 },
      { type: "text", text: " " },
      { type: "link", text: "https://a.ru", href: "https://a.ru" },
    ]);
  });

  it("схема без адреса и чужие схемы ссылкой не становятся", () => {
    expect(links("https:// и www. и javascript:alert(1) и ftp://a.ru")).toEqual([]);
  });
});
