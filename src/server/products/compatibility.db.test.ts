import { beforeEach, expect, it } from "vitest";
import { createProduct, updateProduct } from "@/server/products/service";
import type { SessionUser } from "@/server/session";
import {
  deleteDictionaryItem,
  getCarModels,
  renameDictionaryItem,
  setDictionaryItemActive,
} from "@/server/settings/service";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

describeDb("совместимость товара из справочника моделей (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  async function model(name: string, sortOrder: number) {
    return testDb.dictionaryItem.create({ data: { type: "CAR_MODEL", name, sortOrder } });
  }

  it("сохраняет модели из справочника в его порядке и не принимает чужие", async () => {
    await model("Mercedes Sprinter W906", 10);
    await model("ГАЗель Next", 20);

    const { id } = await createProduct(
      { sku: "S-1", name: "Сиденье", priceKopecks: 100_000, compatibility: ["ГАЗель Next", "Mercedes Sprinter W906"] },
      manager,
    );

    const product = await testDb.product.findUniqueOrThrow({ where: { id } });
    expect(product.compatibility).toEqual(["Mercedes Sprinter W906", "ГАЗель Next"]);
    await expect(updateProduct(id, { compatibility: ["Лада Ларгус"] }, manager)).rejects.toThrow(
      "Нет в справочнике моделей авто: Лада Ларгус",
    );
  });

  it("старое название у товара сохраняется при правке, даже если его нет в справочнике", async () => {
    await model("ГАЗель Next", 10);
    const product = await makeProduct();
    await testDb.product.update({ where: { id: product.id }, data: { compatibility: ["Соболь"] } });

    await updateProduct(product.id, { compatibility: ["Соболь", "ГАЗель Next"] }, manager);

    const fresh = await testDb.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(fresh.compatibility).toEqual(["ГАЗель Next", "Соболь"]);
  });

  it("переименование модели меняет её у товаров", async () => {
    const next = await model("ГАЗель Некст", 10);
    const product = await makeProduct();
    await testDb.product.update({ where: { id: product.id }, data: { compatibility: ["ГАЗель Некст"] } });

    await renameDictionaryItem(next.id, "ГАЗель Next");

    const fresh = await testDb.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(fresh.compatibility).toEqual(["ГАЗель Next"]);
  });

  it("модель у товаров не удаляется, но выключается и пропадает из выбора", async () => {
    const next = await model("ГАЗель Next", 10);
    const product = await makeProduct();
    await testDb.product.update({ where: { id: product.id }, data: { compatibility: ["ГАЗель Next"] } });

    await expect(deleteDictionaryItem(next.id)).rejects.toThrow("Модель указана у товаров (1)");
    await setDictionaryItemActive(next.id, false);

    expect(await getCarModels()).toEqual([]);
    const fresh = await testDb.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(fresh.compatibility).toEqual(["ГАЗель Next"]);
  });
});
