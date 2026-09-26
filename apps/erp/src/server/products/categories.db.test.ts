import { beforeEach, expect, it } from "vitest";
import { CategoryError } from "@buscom/domain/product/categories";
import { createCategory, deleteCategory, resolveCategoryPath, updateCategory } from "@/server/products/categories";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

describeDb("справочник категорий (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  it("раздел с подкатегорией; перенос внутрь себя и повтор названия у соседей отклоняются", async () => {
    const klimat = await createCategory({ name: "Климат", parentId: null }, manager);
    const ljuki = await createCategory({ name: "Люки", parentId: klimat.id }, manager);

    await expect(updateCategory(klimat.id, { name: "Климат", parentId: ljuki.id }, manager)).rejects.toThrow(
      CategoryError,
    );
    await expect(createCategory({ name: "люки", parentId: klimat.id }, manager)).rejects.toThrow(/уже есть/);

    await updateCategory(ljuki.id, { name: "Люки круглые", parentId: null }, manager);
    const moved = await testDb.productCategory.findUniqueOrThrow({ where: { id: ljuki.id } });
    expect(moved).toMatchObject({ name: "Люки круглые", parentId: null });
  });

  it("удаляется только пустая категория", async () => {
    const klimat = await createCategory({ name: "Климат", parentId: null }, manager);
    const ljuki = await createCategory({ name: "Люки", parentId: klimat.id }, manager);
    const product = await makeProduct();
    await testDb.product.update({ where: { id: product.id }, data: { categoryId: ljuki.id } });

    await expect(deleteCategory(klimat.id, manager)).rejects.toThrow(/подкатегории/);
    await expect(deleteCategory(ljuki.id, manager)).rejects.toThrow(/товары/);

    await testDb.product.update({ where: { id: product.id }, data: { categoryId: null } });
    await deleteCategory(ljuki.id, manager);
    await deleteCategory(klimat.id, manager);
    expect(await testDb.productCategory.count()).toBe(0);
  });

  it("путь с сайта: недостающее заводится, старая категория верхнего уровня переезжает под раздел", async () => {
    // Так миграция разложила прежние текстовые категории — все на верхнем уровне.
    const old = await testDb.productCategory.create({ data: { name: "Люки" } });

    const id = await testDb.$transaction((tx) => resolveCategoryPath(tx, ["Климат", "люки"]));

    expect(id).toBe(old.id);
    const klimat = await testDb.productCategory.findFirstOrThrow({ where: { name: "Климат" } });
    expect((await testDb.productCategory.findUniqueOrThrow({ where: { id: old.id } })).parentId).toBe(klimat.id);

    // Повторный путь ничего не заводит.
    expect(await testDb.$transaction((tx) => resolveCategoryPath(tx, ["Климат", "Люки"]))).toBe(old.id);
    expect(await testDb.productCategory.count()).toBe(2);
  });

  it("раздел и подкатегория с одним названием — подкатегория заводится, а не превращает раздел в цикл", async () => {
    const id = await testDb.$transaction((tx) => resolveCategoryPath(tx, ["Стекла", "Стекла"]));
    const leaf = await testDb.productCategory.findUniqueOrThrow({ where: { id: id as string } });
    const root = await testDb.productCategory.findUniqueOrThrow({ where: { id: leaf.parentId as string } });
    expect(root.parentId).toBeNull();
  });
});
