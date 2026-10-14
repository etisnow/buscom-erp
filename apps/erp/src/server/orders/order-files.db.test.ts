import { createCanvas, loadImage } from "@napi-rs/canvas";
import { beforeEach, expect, it } from "vitest";
import { OrderFileError } from "@buscom/domain/order/order-files";
import { ForbiddenError } from "@/server/errors";
import { createOrder } from "@/server/orders/create";
import { deleteOrderFile, listOrderFiles, readOrderFile, uploadOrderFile } from "@/server/orders/order-files";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);

/** Настоящая картинка 1200×600 — миниатюра из неё должна выйти 480×240. */
async function bigPng(): Promise<Uint8Array<ArrayBuffer>> {
  const canvas = createCanvas(1200, 600);
  const context = canvas.getContext("2d");
  context.fillStyle = "#c00";
  context.fillRect(0, 0, 1200, 600);
  return new Uint8Array(await canvas.encode("png"));
}

describeDb("галерея файлов заказа (живая БД)", () => {
  let manager: SessionUser;
  let other: SessionUser;
  let head: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER", "Менеджер");
    other = await makeUser("MANAGER", "Другой менеджер");
    head = await makeUser("HEAD", "Руководитель");
  });

  async function setupOrder() {
    const product = await makeProduct({ priceKopecks: 100_000 });
    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          priceKopecks: product.priceKopecks,
          quantity: 1,
        },
      ],
      user: manager,
    });
    return order.id;
  }

  it("фото получает миниатюру, документ хранится как есть; всё пишется в журнал", async () => {
    const orderId = await setupOrder();
    const photo = await uploadOrderFile(orderId, "фото.png", await bigPng(), manager);
    const archive = await uploadOrderFile(orderId, "документы.zip", ZIP, manager);

    const files = await listOrderFiles(orderId);
    expect(files.map((file) => [file.fileName, file.contentType, file.uploadedByName])).toEqual([
      ["фото.png", "image/png", "Менеджер"],
      ["документы.zip", "application/octet-stream", "Менеджер"],
    ]);

    const thumb = await readOrderFile(photo.id, "thumb");
    expect(thumb?.contentType).toBe("image/jpeg");
    const image = await loadImage(Buffer.from(thumb!.data));
    expect([image.width, image.height]).toEqual([480, 240]);
    // У документа миниатюры нет — отдаётся сам файл
    expect([...(await readOrderFile(archive.id, "thumb"))!.data]).toEqual([...ZIP]);

    await deleteOrderFile(orderId, archive.id, manager);
    expect(await readOrderFile(archive.id, "full")).toBeNull();

    const events = await testDb.orderEvent.findMany({
      where: { orderId, type: "ORDER_DOCUMENT_CHANGED" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.comment)).toEqual([
      "Файлы заказа: добавлен «фото.png»",
      "Файлы заказа: добавлен «документы.zip»",
      "Файлы заказа: удалён «документы.zip»",
    ]);
  });

  it("чужой файл удаляет только руководитель или администратор", async () => {
    const orderId = await setupOrder();
    const file = await uploadOrderFile(orderId, "скан.zip", ZIP, manager);
    await expect(deleteOrderFile(orderId, file.id, other)).rejects.toThrow(ForbiddenError);
    await deleteOrderFile(orderId, file.id, head);
    expect(await testDb.orderFile.count()).toBe(0);
  });

  it("пустой файл не принимается, файл другого заказа не удаляется", async () => {
    const orderId = await setupOrder();
    const otherOrderId = await setupOrder();
    await expect(uploadOrderFile(orderId, "пусто.txt", new Uint8Array(), manager)).rejects.toThrow(OrderFileError);

    const file = await uploadOrderFile(orderId, "скан.zip", ZIP, manager);
    await expect(deleteOrderFile(otherOrderId, file.id, head)).rejects.toThrow(OrderFileError);
  });
});
