import { describe, expect, it } from "vitest";
import { kopecksToWords, numberToWords, pluralize } from "./money-words";

describe("pluralize", () => {
  const forms: [string, string, string] = ["рубль", "рубля", "рублей"];

  it("единица", () => {
    expect(pluralize(1, forms)).toBe("рубль");
    expect(pluralize(21, forms)).toBe("рубль");
    expect(pluralize(101, forms)).toBe("рубль");
  });

  it("от двух до четырёх", () => {
    expect(pluralize(2, forms)).toBe("рубля");
    expect(pluralize(34, forms)).toBe("рубля");
  });

  it("от пяти до двадцати", () => {
    expect(pluralize(5, forms)).toBe("рублей");
    expect(pluralize(20, forms)).toBe("рублей");
    expect(pluralize(0, forms)).toBe("рублей");
  });

  it("особый случай 11–14", () => {
    expect(pluralize(11, forms)).toBe("рублей");
    expect(pluralize(12, forms)).toBe("рублей");
    expect(pluralize(13, forms)).toBe("рублей");
    expect(pluralize(14, forms)).toBe("рублей");
    expect(pluralize(111, forms)).toBe("рублей");
  });
});

describe("numberToWords", () => {
  it("ноль", () => {
    expect(numberToWords(0)).toBe("ноль");
  });

  it("единицы и десятки", () => {
    expect(numberToWords(1)).toBe("один");
    expect(numberToWords(9)).toBe("девять");
    expect(numberToWords(10)).toBe("десять");
    expect(numberToWords(15)).toBe("пятнадцать");
    expect(numberToWords(20)).toBe("двадцать");
    expect(numberToWords(42)).toBe("сорок два");
    expect(numberToWords(99)).toBe("девяносто девять");
  });

  it("сотни", () => {
    expect(numberToWords(100)).toBe("сто");
    expect(numberToWords(101)).toBe("сто один");
    expect(numberToWords(555)).toBe("пятьсот пятьдесят пять");
    expect(numberToWords(900)).toBe("девятьсот");
  });

  it("тысячи в женском роде", () => {
    expect(numberToWords(1000)).toBe("одна тысяча");
    expect(numberToWords(2000)).toBe("две тысячи");
    expect(numberToWords(5000)).toBe("пять тысяч");
    expect(numberToWords(11000)).toBe("одиннадцать тысяч");
    expect(numberToWords(21000)).toBe("двадцать одна тысяча");
  });

  it("миллионы в мужском роде", () => {
    expect(numberToWords(1_000_000)).toBe("один миллион");
    expect(numberToWords(2_000_000)).toBe("два миллиона");
    expect(numberToWords(5_000_000)).toBe("пять миллионов");
  });

  it("пропуск пустых разрядов", () => {
    expect(numberToWords(1_000_001)).toBe("один миллион один");
    expect(numberToWords(1_000_100)).toBe("один миллион сто");
  });

  it("составное число целиком", () => {
    expect(numberToWords(1_234_567)).toBe("один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь");
  });

  it("женский род для единиц по запросу", () => {
    expect(numberToWords(21, true)).toBe("двадцать одна");
  });

  it("отрицательное и дробное — ошибка", () => {
    expect(() => numberToWords(-1)).toThrow(/целое неотрицательное/);
    expect(() => numberToWords(1.5)).toThrow(/целое неотрицательное/);
  });
});

describe("kopecksToWords", () => {
  it("целые рубли", () => {
    expect(kopecksToWords(2_450_000)).toBe("Двадцать четыре тысячи пятьсот рублей 00 копеек");
  });

  it("рубли с копейками", () => {
    expect(kopecksToWords(123_450)).toBe("Одна тысяча двести тридцать четыре рубля 50 копеек");
  });

  it("один рубль одна копейка", () => {
    expect(kopecksToWords(101)).toBe("Один рубль 01 копейка");
  });

  it("две копейки", () => {
    expect(kopecksToWords(202)).toBe("Два рубля 02 копейки");
  });

  it("ноль", () => {
    expect(kopecksToWords(0)).toBe("Ноль рублей 00 копеек");
  });

  it("только копейки", () => {
    expect(kopecksToWords(5)).toBe("Ноль рублей 05 копеек");
  });

  it("одиннадцать рублей — «рублей», не «рубль»", () => {
    expect(kopecksToWords(1_100)).toBe("Одиннадцать рублей 00 копеек");
  });

  it("отрицательная сумма — ошибка", () => {
    expect(() => kopecksToWords(-100)).toThrow(/отрицательных/);
  });
});
