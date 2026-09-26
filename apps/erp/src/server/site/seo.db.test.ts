import { beforeEach, expect, it } from "vitest";
import { updateCategorySite } from "@/server/products/categories";
import { createProduct, updateProduct } from "@/server/products/service";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

const site = (slug: string | null, metaTitle: string | null = null) => ({ slug, metaTitle, metaDescription: null });

describeDb("адрес и метатеги на сайте (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  it("новый товар получает свободный адрес из названия", async () => {
    const first = await createProduct({ sku: "A-1", name: "Сиденье Турист", priceKopecks: 100 }, manager);
    const second = await createProduct({ sku: "A-2", name: "Сиденье Турист", priceKopecks: 100 }, manager);
    const slugs = await testDb.product.findMany({
      where: { id: { in: [first.id, second.id] } },
      select: { slug: true },
    });
    expect(slugs.map((row) => row.slug).sort()).toEqual(["sidene-turist", "sidene-turist-2"]);
  });

  it("смена адреса оставляет 301 со старого; возврат адреса убирает переадресацию", async () => {
    const { id } = await createProduct({ sku: "A-1", name: "Клей", priceKopecks: 100, site: site("klei") }, manager);
    await updateProduct(id, { site: site("klei-1kg", "Клей купить") }, manager);
    expect(await testDb.urlRedirect.findUnique({ where: { fromPath: "/klei" } })).toMatchObject({
      productId: id,
      statusCode: 301,
    });
    expect(await testDb.product.findUniqueOrThrow({ where: { id } })).toMatchObject({
      slug: "klei-1kg",
      metaTitle: "Клей купить",
    });

    await updateProduct(id, { site: site("klei") }, manager);
    expect(await testDb.urlRedirect.findUnique({ where: { fromPath: "/klei" } })).toBeNull();
    expect(await testDb.urlRedirect.findUnique({ where: { fromPath: "/klei-1kg" } })).toMatchObject({ productId: id });
  });

  it("адрес один на весь сайт: занятый товаром, категорией или чужой переадресацией — ошибка", async () => {
    const { id } = await createProduct({ sku: "A-1", name: "Полки", priceKopecks: 100 }, manager);
    const other = await createProduct({ sku: "A-2", name: "Люк", priceKopecks: 100 }, manager);
    const category = await testDb.productCategory.create({ data: { name: "Климат", slug: "klimat" } });

    await expect(updateProduct(other.id, { site: site("polki") }, manager)).rejects.toThrow("занят товаром «Полки»");
    await expect(updateProduct(other.id, { site: site("klimat") }, manager)).rejects.toThrow("категорией «Климат»");
    await expect(updateProduct(other.id, { site: site("Сиденье") }, manager)).rejects.toThrow("латинские");

    // Старый адрес «Полок» теперь ведёт на них — отдать его «Люку» нельзя
    await updateProduct(id, { site: site("polki-novye") }, manager);
    await expect(updateProduct(other.id, { site: site("polki") }, manager)).rejects.toThrow("прежний адрес");

    await updateCategorySite(category.id, site("konditsionery-i-otopiteli"), manager);
    expect(await testDb.urlRedirect.findUnique({ where: { fromPath: "/klimat" } })).toMatchObject({
      categoryId: category.id,
    });
  });

  it("пустой адрес — товар уходит с сайта, старый адрес ведёт на него же", async () => {
    const { id } = await createProduct({ sku: "A-1", name: "Люк", priceKopecks: 100 }, manager);
    await updateProduct(id, { site: site(null) }, manager);
    expect((await testDb.product.findUniqueOrThrow({ where: { id } })).slug).toBeNull();
    expect(await testDb.urlRedirect.findUnique({ where: { fromPath: "/lyuk" } })).toMatchObject({ productId: id });
  });
});
