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

describeDb("аватарки товаров с сайта (живая БД)", () => {
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

  it("скачивает главную и превью, повторный прогон ничего не качает, смена на сайте — замена с новым id", async () => {
    const rows = [row("1", [{ url: "https://bus-com.ru/a-1000.jpg", thumbUrl: "https://bus-com.ru/a-228.jpg" }])];
    await importSiteProducts(rows);

    const first = await importSiteImages(rows, { download });
    expect(first).toMatchObject({ загружено: 1, ужеЕсть: 0 });
    expect(downloads).toEqual(["https://bus-com.ru/a-1000.jpg", "https://bus-com.ru/a-228.jpg"]);
    const image = await testDb.productImage.findFirstOrThrow();
    expect(image).toMatchObject({ contentType: "image/jpeg", thumbContentType: "image/jpeg", sortOrder: 0 });

    downloads = [];
    const again = await importSiteImages(rows, { download });
    expect(again).toMatchObject({ загружено: 0, ужеЕсть: 1 });
    expect(downloads).toEqual([]);

    const changed = [row("1", [{ url: "https://bus-com.ru/a2-1000.jpg", thumbUrl: null }])];
    await importSiteImages(changed, { download });
    const images = await testDb.productImage.findMany();
    expect(images).toHaveLength(1);
    expect(images[0].id).not.toBe(image.id);
    expect(images[0].sourceUrl).toBe("https://bus-com.ru/a2-1000.jpg");
    expect(images[0].thumbData).toBeNull();
  });

  it("не картинку не сохраняет, а пишет в ошибки; товары без картинки и без карточки в ERP считает отдельно", async () => {
    await importSiteProducts([row("1", []), row("2", [])]);

    const report = await importSiteImages(
      [
        row("1", [{ url: "https://bus-com.ru/broken.jpg", thumbUrl: null }]),
        row("2", []),
        row("3", [{ url: "https://bus-com.ru/c.jpg", thumbUrl: null }]),
      ],
      { download },
    );

    expect(report).toMatchObject({ загружено: 0, безКартинки: 1, нетТовара: 1 });
    expect(report.ошибки).toHaveLength(1);
    expect(await testDb.productImage.count()).toBe(0);
  });
});
