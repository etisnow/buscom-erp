import { describe, expect, it } from "vitest";
import { csvDateTime, csvFileName, EXPORT_LIMIT, toCsv } from "./csv";

/** Без BOM и завершающего перевода строки — так проще сравнивать содержимое. */
function body(csv: string): string {
  return csv.replace(/^﻿/, "").replace(/\r\n$/, "");
}

describe("toCsv", () => {
  it("разделяет точкой с запятой и переводит строку CRLF", () => {
    const csv = toCsv([
      ["№", "Клиент"],
      [1, "Иванов"],
    ]);

    expect(body(csv)).toBe("№;Клиент\r\n1;Иванов");
  });

  it("начинается с BOM и заканчивается переводом строки", () => {
    const csv = toCsv([["a"]]);

    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("берёт в кавычки ячейку с разделителем, кавычкой или переводом строки", () => {
    expect(body(toCsv([["ООО «А; Б»"]]))).toBe('"ООО «А; Б»"');
    expect(body(toCsv([['Он сказал "да"']]))).toBe('"Он сказал ""да"""');
    expect(body(toCsv([["первая\nвторая"]]))).toBe('"первая\nвторая"');
  });

  it("пустые значения — пустые ячейки", () => {
    expect(body(toCsv([[null, undefined, ""]]))).toBe(";;");
  });

  it("обезвреживает формулу в начале ячейки", () => {
    expect(body(toCsv([["=1+1"]]))).toBe("'=1+1");
    expect(body(toCsv([["@SUM(A1)"]]))).toBe("'@SUM(A1)");
    expect(body(toCsv([["-ЗАГОЛОВОК"]]))).toBe("'-ЗАГОЛОВОК");
  });

  it("отрицательное число формулой не считается", () => {
    expect(body(toCsv([["-1234,50"]]))).toBe("-1234,50");
    expect(body(toCsv([[-42]]))).toBe("-42");
  });
});

describe("csvDateTime", () => {
  // С запятой Excel видит в ячейке текст, а не дату.
  it("дата и время по Москве без запятой", () => {
    expect(csvDateTime(new Date("2026-09-20T11:35:00Z"))).toBe("20.09.2026 14:35");
  });
});

describe("csvFileName", () => {
  const now = new Date("2026-09-20T11:35:00Z");

  it("имя с датой выгрузки по Москве", () => {
    expect(csvFileName("klienty", now, false)).toBe("klienty-2026-09-20.csv");
    expect(csvFileName("tovary", now, false)).toBe("tovary-2026-09-20.csv");
  });

  // Упёрлись в потолок — это должно быть видно до открытия файла.
  it("обрезанная выгрузка помечена в имени", () => {
    expect(csvFileName("zakazy", now, true)).toBe(`zakazy-2026-09-20-pervye-${EXPORT_LIMIT}.csv`);
  });

  it("дата берётся по Москве, а не по UTC", () => {
    // 21:30 UTC — это уже следующий день в Москве.
    expect(csvFileName("zakazy", new Date("2026-09-20T21:30:00Z"), false)).toBe("zakazy-2026-09-21.csv");
  });
});
