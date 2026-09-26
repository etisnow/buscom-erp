import { beforeEach, expect, it } from "vitest";
import { exportProductsCsv } from "@/server/products/export";
import { describeDb, resetDb, testDb } from "@/test/db";

/** Строки файла без BOM и без завершающего перевода строки. */
function lines(csv: string): string[] {
  return csv.replace(/^﻿/, "").trimEnd().split("\r\n");
}

describeDb("выгрузка каталога в CSV (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("первая строка — заголовки, дальше по строке на товар", async () => {
    await testDb.product.create({ data: { sku: "A-1", name: "Фара левая", priceKopecks: 100_000 } });
    await testDb.product.create({ data: { sku: "A-2", name: "Фара правая", priceKopecks: 100_000 } });

    const { csv, truncated } = await exportProductsCsv({});
    const rows = lines(csv);

    expect(rows[0]).toBe("Артикул;Название;Описание;Категория;Цена, ₽;Совместимость;В каталоге");
    expect(rows).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("цена числом, совместимость одной ячейкой", async () => {
    await testDb.product.create({
      data: {
        sku: "A-1",
        name: "Фара левая",
        priceKopecks: 123_450,
        compatibility: ["ГАЗель Next", "Соболь"],
      },
    });

    const { csv } = await exportProductsCsv({});
    const cells = lines(csv)[1]!.split(";");

    expect(cells[4]).toBe("1234,50");
    // Запятая внутри ячейки разделителем не является: он — точка с запятой.
    expect(cells[5]).toBe("ГАЗель Next, Соболь");
  });

  it("многострочное описание — одной ячейкой в кавычках", async () => {
    await testDb.product.create({
      data: { sku: "A-1", name: "Линолеум", priceKopecks: 1, description: "Первая строка\n• пункт" },
    });

    const { csv } = await exportProductsCsv({});

    expect(csv).toContain('"Первая строка\n• пункт"');
    // Перевод строки внутри кавычек не разрывает строку файла: товар один
    expect(csv.replace(/"[^"]*"/g, "")).not.toContain("• пункт");
  });

  it("скрытый товар помечен словом", async () => {
    await testDb.product.create({ data: { sku: "A-1", name: "Порог", priceKopecks: 1, isActive: false } });

    const cells = lines((await exportProductsCsv({})).csv)[1]!.split(";");

    expect(cells[6]).toBe("скрыт");
  });

  it("выгружается тот же список, что на экране: фильтры учитываются", async () => {
    const light = await testDb.productCategory.create({ data: { name: "Свет" } });
    const optics = await testDb.productCategory.create({ data: { name: "Оптика", parentId: light.id } });
    const salon = await testDb.productCategory.create({ data: { name: "Салон" } });
    await testDb.product.create({ data: { sku: "A-1", name: "Фара левая", categoryId: optics.id, priceKopecks: 1 } });
    await testDb.product.create({ data: { sku: "B-1", name: "Коврик", categoryId: salon.id, priceKopecks: 1 } });

    // Фильтр по разделу захватывает и подкатегории; в файле — путь категории.
    const byLight = await exportProductsCsv({ categoryId: light.id });
    expect(lines(byLight.csv)).toHaveLength(2);
    expect(byLight.csv).toContain("Фара левая");
    expect(byLight.csv).toContain("Свет / Оптика");
    expect(byLight.csv).not.toContain("Коврик");

    const search = await exportProductsCsv({ query: "коврик" });
    expect(lines(search.csv)).toHaveLength(2);
    expect(search.csv).toContain("Коврик");
  });

  it("имя файла — дата выгрузки", async () => {
    const { fileName } = await exportProductsCsv({});

    expect(fileName).toMatch(/^tovary-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
