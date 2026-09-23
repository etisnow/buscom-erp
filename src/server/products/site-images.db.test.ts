import { beforeEach, expect, it } from "vitest";
import { importSiteProducts, type SiteProductRow } from "@/server/products/site-import";
import { importSiteImages } from "@/server/products/site-images";
import { describeDb, resetDb, testDb } from "@/test/db";

const JPEG = (marker: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, marker]);

function row(externalId: string, images: SiteProductRow["images"]): SiteProductRow {
  return {
    externalId,
    url: `https://bus-com.ru/p${externalId}`,
    name: `Товар ${externalId}`,
    sku: `SKU${externalId}`,
    priceKopecks: 100_000,
    isActive: true,
    manufacturer: null,
    category: null,
    images,
  };
}

const gallery = (...urls: string[]) => urls.map((url) => ({ url, thumbUrl: `${url}-thumb` }));

/** Картинки товара по порядку — так, как их увидит карточка */
async function imagesOf(externalId: string) {
  const product = await testDb.product.findFirstOrThrow({
    where: { externalId },
    select: { images: { orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true, sourceUrl: true } } },
  });
  return product.images;
}

describeDb("галерея товаров с сайта (живая БД)", () => {
  let downloads: string[];
  const download = async (url: string) => {
    downloads.push(url);
    if (url.includes("broken")) return new Uint8Array(new TextEncoder().encode("<html>404</html>"));
    return JPEG(url.length % 250);
  };

  beforeEach(async () => {
    await resetDb();
    downloads = [];
  });

  it("качает всю галерею в порядке сайта, повторный прогон ничего не качает", async () => {
    const rows = [
      row("1", gallery("https://bus-com.ru/a.jpg", "https://bus-com.ru/b.jpg", "https://bus-com.ru/c.jpg")),
    ];
    await importSiteProducts(rows);

    const first = await importSiteImages(rows, { download });
    expect(first).toMatchObject({ загружено: 3, ужеЕсть: 0, удалено: 0 });
    expect(downloads).toEqual([
      "https://bus-com.ru/a.jpg",
      "https://bus-com.ru/a.jpg-thumb",
      "https://bus-com.ru/b.jpg",
      "https://bus-com.ru/b.jpg-thumb",
      "https://bus-com.ru/c.jpg",
      "https://bus-com.ru/c.jpg-thumb",
    ]);
    expect((await imagesOf("1")).map((image) => [image.sortOrder, image.sourceUrl])).toEqual([
      [0, "https://bus-com.ru/a.jpg"],
      [1, "https://bus-com.ru/b.jpg"],
      [2, "https://bus-com.ru/c.jpg"],
    ]);

    downloads = [];
    const again = await importSiteImages(rows, { download });
    expect(again).toMatchObject({ загружено: 0, ужеЕсть: 3, удалено: 0 });
    expect(downloads).toEqual([]);
  });

  it("новая картинка докачивается, убранная с сайта уходит, порядок — как на сайте", async () => {
    const rows = [row("1", gallery("https://bus-com.ru/a.jpg", "https://bus-com.ru/b.jpg"))];
    await importSiteProducts(rows);
    await importSiteImages(rows, { download });
    const before = await imagesOf("1");

    downloads = [];
    const changed = [row("1", gallery("https://bus-com.ru/new.jpg", "https://bus-com.ru/a.jpg"))];
    const report = await importSiteImages(changed, { download });

    expect(report).toMatchObject({ загружено: 1, ужеЕсть: 1, удалено: 1 });
    expect(downloads).toEqual(["https://bus-com.ru/new.jpg", "https://bus-com.ru/new.jpg-thumb"]);

    const after = await imagesOf("1");
    expect(after.map((image) => [image.sortOrder, image.sourceUrl])).toEqual([
      [0, "https://bus-com.ru/new.jpg"],
      [1, "https://bus-com.ru/a.jpg"],
    ]);
    // Картинка, оставшаяся на сайте, не перекачана: та же запись, тот же id
    expect(after[1].id).toBe(before.find((image) => image.sourceUrl === "https://bus-com.ru/a.jpg")?.id);
  });

  it("загруженную руками картинку не трогает — сдвигает за картинки сайта", async () => {
    const rows = [row("1", gallery("https://bus-com.ru/a.jpg"))];
    await importSiteProducts(rows);
    const product = await testDb.product.findFirstOrThrow({ where: { externalId: "1" }, select: { id: true } });
    const mine = await testDb.productImage.create({
      data: { productId: product.id, sortOrder: 0, contentType: "image/jpeg", data: JPEG(7), byteSize: 5 },
      select: { id: true },
    });

    await importSiteImages(rows, { download });

    expect((await imagesOf("1")).map((image) => [image.sortOrder, image.sourceUrl])).toEqual([
      [0, "https://bus-com.ru/a.jpg"],
      [1, null],
    ]);
    expect(await testDb.productImage.findUnique({ where: { id: mine.id } })).not.toBeNull();
  });

  it("не картинку не сохраняет, а пишет в ошибки; товары без картинки и без карточки в ERP считает отдельно", async () => {
    await importSiteProducts([row("1", []), row("2", [])]);

    const report = await importSiteImages(
      [row("1", gallery("https://bus-com.ru/broken.jpg")), row("2", []), row("3", gallery("https://bus-com.ru/c.jpg"))],
      { download },
    );

    expect(report).toMatchObject({ загружено: 0, безКартинки: 1, нетТовара: 1 });
    expect(report.ошибки).toHaveLength(1);
    expect(await testDb.productImage.count()).toBe(0);
  });

  it("проверка (--dry-run) считает, но в базу не пишет", async () => {
    const rows = [row("1", gallery("https://bus-com.ru/a.jpg", "https://bus-com.ru/b.jpg"))];
    await importSiteProducts(rows);

    const report = await importSiteImages(rows, { download, dryRun: true });

    expect(report).toMatchObject({ загружено: 2, ужеЕсть: 0 });
    expect(downloads).toEqual([]);
    expect(await testDb.productImage.count()).toBe(0);
  });
});
