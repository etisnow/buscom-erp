import { describe, expect, it } from "vitest";
import { newsInputSchema } from "./news";

describe("newsInputSchema", () => {
  it("обрезает пробелы, приводит переводы строк и схлопывает лишние пустые строки", () => {
    expect(newsInputSchema.parse({ title: "  Чат  ", body: "Раз\r\n\r\n\r\n\r\nДва \n" })).toEqual({
      title: "Чат",
      body: "Раз\n\nДва",
    });
  });

  it("не принимает пустые заголовок и текст", () => {
    expect(newsInputSchema.safeParse({ title: "  ", body: "текст" }).success).toBe(false);
    expect(newsInputSchema.safeParse({ title: "Заголовок", body: " \n " }).success).toBe(false);
  });

  it("не принимает слишком длинное", () => {
    expect(newsInputSchema.safeParse({ title: "а".repeat(201), body: "текст" }).success).toBe(false);
    expect(newsInputSchema.safeParse({ title: "Заголовок", body: "а".repeat(10_001) }).success).toBe(false);
  });
});
