import { beforeEach, expect, it } from "vitest";
import { listProductLogs } from "@/server/products/log";
import { createProduct, deleteProduct, updateProduct } from "@/server/products/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";

describeDb("журнал товаров (живая БД)", () => {
  let head: SessionUser;

  beforeEach(async () => {
    await resetDb();
    head = await makeUser("HEAD");
  });

  it("пишет добавление, правку, скрытие, возвращение и удаление", async () => {
    const { id } = await createProduct({ sku: "LOG-1", name: "Люк", priceKopecks: 100_000 }, head);
    await updateProduct(id, { priceKopecks: 120_000, name: "Люк большой" }, head);
    await updateProduct(id, { isActive: false }, head);
    await updateProduct(id, { isActive: true }, head);
    await deleteProduct(id, head);

    const logs = await testDb.productLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(logs.map((log) => log.action)).toEqual(["CREATED", "UPDATED", "HIDDEN", "SHOWN", "DELETED"]);
    expect(logs[1]?.changes).toEqual([
      { label: "Название", from: "Люк", to: "Люк большой" },
      { label: "Цена", from: expect.stringContaining("1"), to: expect.stringContaining("1") },
    ]);
    expect(logs.every((log) => log.userId === head.id && log.productId === id)).toBe(true);
    // Запись о удалении переживает сам товар
    expect(logs[4]).toMatchObject({ sku: "LOG-1", name: "Люк большой" });
  });

  it("сохранение без отличий журнал не пополняет", async () => {
    const { id } = await createProduct({ sku: "LOG-2", name: "Люк", priceKopecks: 100_000 }, head);
    await updateProduct(id, { name: "Люк", priceKopecks: 100_000 }, head);
    expect(await testDb.productLog.count()).toBe(1);
  });

  it("список фильтруется по действию и поиску", async () => {
    const { id } = await createProduct({ sku: "LOG-3", name: "Стекло", priceKopecks: 100 }, head);
    await createProduct({ sku: "OTHER", name: "Сиденье", priceKopecks: 100 }, head);
    await updateProduct(id, { isActive: false }, head);

    expect((await listProductLogs({ action: "HIDDEN" })).total).toBe(1);
    expect((await listProductLogs({ query: "стекло" })).total).toBe(2);
    expect((await listProductLogs({})).total).toBe(3);
  });
});
