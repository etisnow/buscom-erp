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

    expect(rows[0]).toBe(
      "Артикул;Название;Категория;Цена, ₽;Остаток;Резерв;Свободно;Под заказ;Срок, дн.;Совместимость;В каталоге",
    );
    expect(rows).toHaveLength(3);
    expect(truncated).toBe(false);
  });

  it("цена числом, свободный остаток посчитан, совместимость одной ячейкой", async () => {
    await testDb.product.create({
      data: {
        sku: "A-1",
        name: "Фара левая",
        category: "Оптика",
        priceKopecks: 123_450,
        stock: 10,
        reserved: 3,
        compatibility: ["ГАЗель Next", "Соболь"],
      },
    });

    const { csv } = await exportProductsCsv({});
    const cells = lines(csv)[1]!.split(";");

    expect(cells[3]).toBe("1234,50");
    expect(cells[4]).toBe("10");
    expect(cells[5]).toBe("3");
    expect(cells[6]).toBe("7");
    // Запятая внутри ячейки разделителем не является: он — точка с запятой.
    expect(cells[9]).toBe("ГАЗель Next, Соболь");
  });

  it("свободный остаток может быть отрицательным — это видно в файле", async () => {
    await testDb.product.create({ data: { sku: "A-1", name: "Фара", priceKopecks: 1, stock: 1, reserved: 3 } });

    const cells = lines((await exportProductsCsv({})).csv)[1]!.split(";");

    expect(cells[6]).toBe("-2");
  });

  it("товар под заказ и скрытый помечены словами", async () => {
    await testDb.product.create({
      data: { sku: "A-1", name: "Порог", priceKopecks: 1, madeToOrder: true, leadTimeDays: 14, isActive: false },
    });

    const cells = lines((await exportProductsCsv({})).csv)[1]!.split(";");

    expect(cells[7]).toBe("да");
    expect(cells[8]).toBe("14");
    expect(cells[10]).toBe("скрыт");
  });

  it("выгружается тот же список, что на экране: фильтры учитываются", async () => {
    await testDb.product.create({ data: { sku: "A-1", name: "Фара левая", category: "Оптика", priceKopecks: 1 } });
    await testDb.product.create({ data: { sku: "B-1", name: "Коврик", category: "Салон", priceKopecks: 1 } });

    const optics = await exportProductsCsv({ category: "Оптика" });
    expect(lines(optics.csv)).toHaveLength(2);
    expect(optics.csv).toContain("Фара левая");
    expect(optics.csv).not.toContain("Коврик");

    const search = await exportProductsCsv({ query: "коврик" });
    expect(lines(search.csv)).toHaveLength(2);
    expect(search.csv).toContain("Коврик");
  });

  it("имя файла — дата выгрузки", async () => {
    const { fileName } = await exportProductsCsv({});

    expect(fileName).toMatch(/^tovary-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
