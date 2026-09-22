import { beforeEach, expect, it } from "vitest";
import { ForbiddenError } from "@/server/errors";
import { createOrder } from "@/server/orders/create";
import {
  deleteSupplierDocument,
  readSupplierDocument,
  uploadSupplierDocument,
} from "@/server/orders/supplier-documents";
import { createSupplier } from "@/server/suppliers/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"

describeDb("артефакты по поставщику в заказе (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  /** Заказ с одной позицией у своего поставщика — трек заводится сам (syncSupplierTracks). */
  async function setupOrder() {
    const { id: supplierId } = await createSupplier({ type: "COMPANY", name: "Автокомплект" }, manager);
    const product = await makeProduct({ priceKopecks: 100_000 });
    await testDb.productSupplier.create({ data: { productId: product.id, supplierId, purchasePriceKopecks: 60_000 } });

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
          supplierId,
        },
      ],
      user: manager,
    });

    return { supplierId, orderId: order.id };
  }

  it("прикрепляет файл и пишет событие в журнал", async () => {
    const { supplierId, orderId } = await setupOrder();

    const { id } = await uploadSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", "счёт.pdf", PDF, manager);

    const doc = await readSupplierDocument(id);
    expect(doc?.fileName).toBe("счёт.pdf");
    expect(doc?.contentType).toBe("application/pdf");

    const events = await testDb.orderEvent.findMany({ where: { orderId, type: "SUPPLIER_DOCUMENT_CHANGED" } });
    expect(events).toHaveLength(1);
    expect(events[0].comment).toContain("прикреплён");
  });

  it("замена — новый id вместо старого, старый файл недоступен, строка одна", async () => {
    const { supplierId, orderId } = await setupOrder();
    const first = await uploadSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", "первый.pdf", PDF, manager);

    const second = await uploadSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", "второй.pdf", PDF, manager);

    expect(second.id).not.toBe(first.id);
    expect(await readSupplierDocument(first.id)).toBeNull();
    expect((await readSupplierDocument(second.id))?.fileName).toBe("второй.pdf");
    expect(await testDb.orderSupplierDocument.count({ where: { orderId, supplierId } })).toBe(1);

    const events = await testDb.orderEvent.findMany({ where: { orderId, type: "SUPPLIER_DOCUMENT_CHANGED" } });
    expect(events[events.length - 1].comment).toContain("заменён");
  });

  it("удаляет файл и пишет событие", async () => {
    const { supplierId, orderId } = await setupOrder();
    const { id } = await uploadSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", "счёт.pdf", PDF, manager);

    await deleteSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", manager);

    expect(await readSupplierDocument(id)).toBeNull();
    const events = await testDb.orderEvent.findMany({ where: { orderId, type: "SUPPLIER_DOCUMENT_CHANGED" } });
    expect(events.some((event) => event.comment?.includes("удалён"))).toBe(true);
  });

  it("удаление отсутствующего файла — не ошибка", async () => {
    const { supplierId, orderId } = await setupOrder();
    await expect(deleteSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", manager)).resolves.toBeUndefined();
  });

  it("не позволяет прикрепить или убрать файл у завершённого заказа", async () => {
    const { supplierId, orderId } = await setupOrder();
    await testDb.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } });

    await expect(
      uploadSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", "счёт.pdf", PDF, manager),
    ).rejects.toThrow(ForbiddenError);
    await expect(deleteSupplierDocument(orderId, supplierId, "SUPPLIER_INVOICE", manager)).rejects.toThrow(
      ForbiddenError,
    );
  });
});
