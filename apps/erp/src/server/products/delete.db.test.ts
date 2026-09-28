import { beforeEach, expect, it } from "vitest";
import { createOrder } from "@/server/orders/create";
import { deleteProduct } from "@/server/products/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

describeDb("удаление товара (живая БД)", () => {
  let manager: SessionUser;
  let head: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
    head = await makeUser("HEAD");
  });

  it("менеджеру нельзя — только руководителю и администратору", async () => {
    const product = await makeProduct();
    await expect(deleteProduct(product.id, manager)).rejects.toThrow(/руководитель или администратор/);
    expect(await testDb.product.count()).toBe(1);
  });

  it("заказ остаётся со снимком, адреса товара ведут в категорию", async () => {
    const category = await testDb.productCategory.create({ data: { name: "Люки", slug: "lyuki" } });
    const product = await makeProduct({ priceKopecks: 100_000 });
    await testDb.product.update({ where: { id: product.id }, data: { slug: "lyuk-gl9", categoryId: category.id } });
    await testDb.urlRedirect.create({ data: { fromPath: "/old-lyuk", productId: product.id } });
    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [{ productId: product.id, sku: product.sku, name: product.name, priceKopecks: 100_000, quantity: 1 }],
      user: manager,
    });

    expect(await deleteProduct(product.id, head)).toEqual({ ordersCount: 1 });

    expect(await testDb.product.findUnique({ where: { id: product.id } })).toBeNull();
    const item = await testDb.orderItem.findFirstOrThrow({ where: { orderId: order.id } });
    expect(item).toMatchObject({ productId: null, sku: product.sku, name: product.name, priceKopecks: 100_000 });
    const redirects = await testDb.urlRedirect.findMany({ orderBy: { fromPath: "asc" } });
    expect(redirects.map((r) => [r.fromPath, r.categoryId, r.toPath, r.statusCode])).toEqual([
      ["/lyuk-gl9", category.id, null, 301],
      ["/old-lyuk", category.id, null, 301],
    ]);
  });

  it("без категории на сайте — адрес ведёт на главную", async () => {
    const product = await makeProduct();
    await testDb.product.update({ where: { id: product.id }, data: { slug: "bez-kategorii" } });

    await deleteProduct(product.id, head);

    const redirect = await testDb.urlRedirect.findUniqueOrThrow({ where: { fromPath: "/bez-kategorii" } });
    expect(redirect).toMatchObject({ categoryId: null, productId: null, toPath: "/", statusCode: 301 });
  });
});
