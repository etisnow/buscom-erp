import { beforeEach, expect, it } from "vitest";
import { SupplierDocumentError } from "@/domain/order/supplier-document";
import { ForbiddenError } from "@/server/errors";
import { createOrder } from "@/server/orders/create";
import { deleteOrderDocument, readOrderDocument, uploadOrderDocument } from "@/server/orders/order-documents";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"

describeDb("файлы заказа — транспортная накладная (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
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

  it("прикрепляет, заменяет и удаляет накладную с записями в журнале", async () => {
    const orderId = await setupOrder();

    const first = await uploadOrderDocument(orderId, "WAYBILL", "накладная.pdf", PDF, manager);
    expect((await readOrderDocument(first.id))?.contentType).toBe("application/pdf");

    const second = await uploadOrderDocument(orderId, "WAYBILL", "новая.pdf", PDF, manager);
    expect(second.id).not.toBe(first.id);
    expect(await readOrderDocument(first.id)).toBeNull();
    expect(await testDb.orderDocument.count({ where: { orderId } })).toBe(1);

    await deleteOrderDocument(orderId, "WAYBILL", manager);
    expect(await readOrderDocument(second.id)).toBeNull();

    const events = await testDb.orderEvent.findMany({
      where: { orderId, type: "ORDER_DOCUMENT_CHANGED" },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.comment)).toEqual([
      "Транспортная накладная: файл «накладная.pdf» прикреплён",
      "Транспортная накладная: файл «новая.pdf» заменён",
      "Транспортная накладная: файл «новая.pdf» удалён",
    ]);
  });

  it("не принимает файл, который не PDF и не картинка", async () => {
    const orderId = await setupOrder();
    await expect(
      uploadOrderDocument(orderId, "WAYBILL", "накладная.exe", new Uint8Array([0x4d, 0x5a, 0, 0]), manager),
    ).rejects.toThrow(SupplierDocumentError);
  });

  it("у выполненного заказа менять накладную нельзя", async () => {
    const orderId = await setupOrder();
    await testDb.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } });

    await expect(uploadOrderDocument(orderId, "WAYBILL", "накладная.pdf", PDF, manager)).rejects.toThrow(
      ForbiddenError,
    );
    await expect(deleteOrderDocument(orderId, "WAYBILL", manager)).rejects.toThrow(ForbiddenError);
  });
});
