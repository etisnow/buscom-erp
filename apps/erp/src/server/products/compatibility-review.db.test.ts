import { beforeEach, expect, it } from "vitest";
import { listCompatibilityReview } from "@/server/products/compatibility-review";
import { createProduct, updateProduct } from "@/server/products/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";

describeDb("разбор совместимости (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
    for (const [index, name] of ["Mercedes Sprinter Classic", "Mercedes Sprinter W907", "ГАЗель Next"].entries()) {
      await testDb.dictionaryItem.create({ data: { type: "CAR_MODEL", name, sortOrder: index } });
    }
  });

  const product = (sku: string, name: string, extra: object = {}) =>
    createProduct({ sku, name, priceKopecks: 100_000, ...extra }, manager);

  it("в разборе — товары в продаже без моделей и с подсказкой; однозначные — первыми", async () => {
    await product("A", "Сиденье Mercedes Sprinter"); // только семейство
    await product("B", "Сиденье «ГАЗель Next»");
    await product("C", "Клей для ткани"); // подсказывать нечего
    await product("D", "Полка ГАЗель Next", { compatibility: ["ГАЗель Next"] }); // уже размечен
    await product("E", "Люк ГАЗель Next", { isActive: false }); // снят с продажи

    const { rows, withoutModels } = await listCompatibilityReview();
    expect(withoutModels).toBe(3);
    expect(rows.map((row) => [row.sku, row.suggested, row.unclear.map((item) => item.family)])).toEqual([
      ["B", ["ГАЗель Next"], []],
      ["A", [], ["Mercedes Sprinter"]],
    ]);
  });

  it("сохранённый товар уходит из разбора", async () => {
    const { id } = await product("B", "Сиденье «ГАЗель Next»");
    await updateProduct(id, { compatibility: ["ГАЗель Next"] }, manager);
    expect((await listCompatibilityReview()).rows).toEqual([]);
  });
});
