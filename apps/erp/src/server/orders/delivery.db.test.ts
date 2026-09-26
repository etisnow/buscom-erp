import { beforeEach, expect, it } from "vitest";
import { parseDateInput } from "@buscom/domain/datetime";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { createOrder } from "@/server/orders/create";
import { updateOrderDelivery } from "@/server/orders/delivery";
import { describeDb, resetDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

describeDb("доставка: дата отгрузки и груз (живая БД)", () => {
  let manager: SessionUser;
  let orderId: string;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент", phone: "8 916 123-45-67" },
      items: [{ sku: "A-1", name: "Сиденье", priceKopecks: 100_000, quantity: 1 }],
      user: manager,
    });
    orderId = order.id;
  });

  it("сохраняет вес, габариты и дату отгрузки и пишет прежние значения в журнал", async () => {
    const shippedAt = parseDateInput("2026-09-20")!;
    const order = await updateOrderDelivery({
      orderId,
      user: manager,
      shippedAt,
      cargo: { weightGrams: 12_500, lengthCm: 120, widthCm: 60, heightCm: 40 },
    });

    expect(order).toMatchObject({
      shippedAt,
      cargoWeightGrams: 12_500,
      cargoLengthCm: 120,
      cargoWidthCm: 60,
      cargoHeightCm: 40,
    });
    const event = await db.orderEvent.findFirstOrThrow({
      where: { orderId, type: "UPDATED" },
      orderBy: { createdAt: "desc" },
    });
    expect(event.payload).toMatchObject({
      before: { cargoWeightGrams: null, shippedAt: null },
      after: { cargoWeightGrams: 12_500, cargoLengthCm: 120 },
    });
  });

  it("без груза во входе груз не трогается; null очищает", async () => {
    await updateOrderDelivery({
      orderId,
      user: manager,
      cargo: { weightGrams: 1000, lengthCm: null, widthCm: null, heightCm: null },
    });
    const untouched = await updateOrderDelivery({ orderId, user: manager, trackingNumber: "TRACK-1" });
    expect(untouched.cargoWeightGrams).toBe(1000);

    const cleared = await updateOrderDelivery({
      orderId,
      user: manager,
      shippedAt: null,
      cargo: { weightGrams: null, lengthCm: null, widthCm: null, heightCm: null },
    });
    expect(cleared.cargoWeightGrams).toBeNull();
    expect(cleared.shippedAt).toBeNull();
  });

  it("у закрытого заказа груз не правится", async () => {
    await db.order.update({ where: { id: orderId }, data: { status: "COMPLETED" } });
    await expect(
      updateOrderDelivery({
        orderId,
        user: manager,
        cargo: { weightGrams: 1000, lengthCm: null, widthCm: null, heightCm: null },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
