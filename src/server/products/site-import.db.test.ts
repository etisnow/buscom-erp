import { beforeEach, expect, it } from "vitest";
import { importSiteProducts, type SiteProductRow } from "@/server/products/site-import";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct } from "@/test/fixtures";

function row(overrides: Partial<SiteProductRow> & Pick<SiteProductRow, "externalId">): SiteProductRow {
  return {
    url: `https://bus-com.ru/p${overrides.externalId}`,
    name: `Товар ${overrides.externalId}`,
    sku: `SKU${overrides.externalId}`,
    priceKopecks: 100_000,
    isActive: true,
    manufacturer: "Россия",
    category: "Полки",
    ...overrides,
  };
}

describeDb("перенос каталога сайта (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("заводит товары с externalId; повтор артикула на сайте и занятый артикул — с суффиксом", async () => {
    await makeProduct({ sku: "DEMO" });

    const report = await importSiteProducts([
      row({ externalId: "440", sku: "SHT02" }),
      row({ externalId: "441", sku: "SHT02" }),
      row({ externalId: "7", sku: "DEMO" }),
    ]);

    expect(report).toMatchObject({ всего: 3, создано: 3, обновлено: 0 });
    const products = await testDb.product.findMany({ where: { externalId: { not: null } }, orderBy: { sku: "asc" } });
    expect(products.map((item) => [item.externalId, item.sku])).toEqual([
      ["7", "DEMO-7"],
      ["440", "SHT02"],
      ["441", "SHT02-441"],
    ]);
  });

  it("повторный прогон не задваивает, а обновляет по сайту; поставщиков не трогает", async () => {
    await importSiteProducts([row({ externalId: "1", priceKopecks: 100_000 })]);
    const product = await testDb.product.findFirstOrThrow({ where: { externalId: "1" } });
    const supplier = await testDb.supplier.create({ data: { name: "Поставщик" } });
    await testDb.productSupplier.create({
      data: { productId: product.id, supplierId: supplier.id, purchasePriceKopecks: 50_000 },
    });

    const same = await importSiteProducts([row({ externalId: "1", priceKopecks: 100_000 })]);
    expect(same).toMatchObject({ создано: 0, обновлено: 0, безИзменений: 1 });

    const changed = await importSiteProducts([row({ externalId: "1", priceKopecks: 120_000, name: "Новое имя" })]);
    expect(changed).toMatchObject({ создано: 0, обновлено: 1 });

    const fresh = await testDb.product.findFirstOrThrow({ where: { externalId: "1" }, include: { suppliers: true } });
    expect(fresh).toMatchObject({ name: "Новое имя", priceKopecks: 120_000 });
    expect(fresh.suppliers).toHaveLength(1);
    expect(await testDb.product.count()).toBe(1);
  });

  it("описание переносится и обновляется; без поля в файле прежнее описание остаётся", async () => {
    await importSiteProducts([row({ externalId: "10", description: "Клей для ткани.\n• 1 кг" })]);
    const created = await testDb.product.findFirstOrThrow({ where: { externalId: "10" } });
    expect(created.description).toBe("Клей для ткани.\n• 1 кг");

    // Выгрузка без описаний (файл старого формата) описание не стирает
    const same = await importSiteProducts([row({ externalId: "10" })]);
    expect(same).toMatchObject({ безИзменений: 1 });
    expect((await testDb.product.findFirstOrThrow({ where: { externalId: "10" } })).description).toBe(
      "Клей для ткани.\n• 1 кг",
    );

    // Описание сменилось на сайте — обновляем
    const changed = await importSiteProducts([row({ externalId: "10", description: "Другое описание" })]);
    expect(changed).toMatchObject({ обновлено: 1 });
    expect((await testDb.product.findFirstOrThrow({ where: { externalId: "10" } })).description).toBe(
      "Другое описание",
    );

    // Описание убрали с сайта — чистим и в ERP
    await importSiteProducts([row({ externalId: "10", description: null })]);
    expect((await testDb.product.findFirstOrThrow({ where: { externalId: "10" } })).description).toBeNull();
  });

  it("проверочный прогон ничего не пишет", async () => {
    const report = await importSiteProducts([row({ externalId: "1" })], { dryRun: true });
    expect(report.создано).toBe(1);
    expect(await testDb.product.count()).toBe(0);
  });

  it("переносит опции и при повторном прогоне правит их на месте, по id сайта", async () => {
    const options = [
      {
        externalId: "360",
        name: "Выбор стекла",
        required: true,
        values: [
          { externalId: "731", name: "Левое", priceDeltaKopecks: 1_225_000 },
          { externalId: "732", name: "Правое", priceDeltaKopecks: 475_000 },
        ],
      },
    ];
    await importSiteProducts([row({ externalId: "340", priceKopecks: 0, options })]);
    const before = await testDb.productOptionValue.findFirstOrThrow({ where: { externalId: "731" } });

    const again = await importSiteProducts([row({ externalId: "340", priceKopecks: 0, options })]);
    expect(again).toMatchObject({ безИзменений: 1, сОпциями: 0 });

    options[0].values[0].priceDeltaKopecks = 1_300_000;
    const changed = await importSiteProducts([row({ externalId: "340", priceKopecks: 0, options })]);
    expect(changed).toMatchObject({ обновлено: 1, сОпциями: 1 });

    const after = await testDb.productOptionValue.findFirstOrThrow({ where: { externalId: "731" } });
    expect(after.id).toBe(before.id);
    expect(after.priceDeltaKopecks).toBe(1_300_000);
  });
});
