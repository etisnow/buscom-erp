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

  it("проверочный прогон ничего не пишет", async () => {
    const report = await importSiteProducts([row({ externalId: "1" })], { dryRun: true });
    expect(report.создано).toBe(1);
    expect(await testDb.product.count()).toBe(0);
  });
});
