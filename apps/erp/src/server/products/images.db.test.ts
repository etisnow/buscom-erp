import { beforeEach, expect, it } from "vitest";
import { ProductImageError } from "@buscom/domain/product/images";
import { addImages, deleteImage, makeImageMain, readImage } from "@/server/products/images";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

const JPEG = (marker: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, marker]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOT_IMAGE = new Uint8Array(new TextEncoder().encode("<html>404</html>"));

describeDb("галерея товара в карточке (живая БД)", () => {
  let manager: SessionUser;
  let productId: string;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
    productId = (await makeProduct()).id;
  });

  const order = async () =>
    (
      await testDb.productImage.findMany({
        where: { productId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, sortOrder: true, contentType: true },
      })
    ).map((image) => [image.sortOrder, image.contentType] as const);

  it("пачка картинок встаёт в конец галереи по порядку выбора", async () => {
    await addImages(productId, [JPEG(1)], manager);
    await addImages(productId, [PNG, JPEG(2)], manager);

    expect(await order()).toEqual([
      [0, "image/jpeg"],
      [1, "image/png"],
      [2, "image/jpeg"],
    ]);
  });

  it("не картинка в пачке отменяет всю пачку", async () => {
    await addImages(productId, [JPEG(1)], manager);

    await expect(addImages(productId, [PNG, NOT_IMAGE], manager)).rejects.toThrow(ProductImageError);
    expect(await testDb.productImage.count({ where: { productId } })).toBe(1);
  });

  it("«Сделать главной» уводит картинку в начало, остальные сдвигаются", async () => {
    await addImages(productId, [JPEG(1), JPEG(2), JPEG(3)], manager);
    const before = await testDb.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });

    await makeImageMain(before[2].id, manager);

    const after = await testDb.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
    expect(after.map((image) => image.id)).toEqual([before[2].id, before[0].id, before[1].id]);
    expect(after.map((image) => image.sortOrder)).toEqual([0, 1, 2]);
  });

  it("удаление картинки не оставляет дырок в порядке", async () => {
    await addImages(productId, [JPEG(1), JPEG(2), JPEG(3)], manager);
    const before = await testDb.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });

    await deleteImage(before[0].id, manager);

    const after = await testDb.productImage.findMany({ where: { productId }, orderBy: { sortOrder: "asc" } });
    expect(after.map((image) => image.id)).toEqual([before[1].id, before[2].id]);
    expect(after.map((image) => image.sortOrder)).toEqual([0, 1]);
  });

  it("картинки нет — понятная ошибка, а не падение", async () => {
    await expect(deleteImage("нет-такой", manager)).rejects.toThrow(/не найдена/);
    await expect(makeImageMain("нет-такой", manager)).rejects.toThrow(/не найдена/);
  });

  it("превью нет — отдаётся полная картинка", async () => {
    await addImages(productId, [JPEG(1)], manager);
    const image = await testDb.productImage.findFirstOrThrow({ where: { productId } });

    const thumb = await readImage(image.id, "thumb");
    expect(thumb).toMatchObject({ contentType: "image/jpeg" });
    expect([...(thumb?.data ?? [])]).toEqual([...JPEG(1)]);
    expect(await readImage("нет-такой", "full")).toBeNull();
  });
});
