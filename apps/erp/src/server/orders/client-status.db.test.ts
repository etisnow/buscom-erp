import { beforeEach, expect, it } from "vitest";
import { db } from "@/server/db";
import { createOrder } from "@/server/orders/create";
import { findClientOrderStatus } from "@/server/orders/client-status";
import { addPayment } from "@/server/orders/payments";
import { changeOrderStatus } from "@/server/orders/status";
import { saveClientStatusMapping } from "@/server/settings/service";
import { describeDb, resetDb } from "@/test/db";
import { makeUser } from "@/test/fixtures";
import type { SessionUser } from "@/server/session";

describeDb("статус заказа для клиента (живая БД)", () => {
  let manager: SessionUser;
  let orderId: string;
  let orderNumber: number;

  /** Заказ, заведённый менеджером, сразу «в работе»; для проверок «Принят» возвращаем «создан» */
  const makeNew = () => db.order.update({ where: { id: orderId }, data: { status: "NEW" } });

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
    orderNumber = order.number;
  });

  it("находит заказ по номеру и телефону в любом написании; у нового заказа — «Принят»", async () => {
    await makeNew();
    const found = await findClientOrderStatus(orderNumber, "+7 (916) 123-45-67");
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.status).toMatchObject({
      number: orderNumber,
      current: "RECEIVED",
      headline: "Принят",
      tracking: null,
    });
    expect(found.status.steps.map((step) => step.state)).toEqual([
      "current",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("чужой телефон и несуществующий номер неотличимы — «не найден»", async () => {
    expect(await findClientOrderStatus(orderNumber, "+7 916 000-00-00")).toEqual({ ok: false, reason: "not-found" });
    expect(await findClientOrderStatus(orderNumber + 1000, "8 916 123-45-67")).toEqual({
      ok: false,
      reason: "not-found",
    });
    expect(await findClientOrderStatus(orderNumber, "не телефон")).toEqual({ ok: false, reason: "not-found" });
  });

  it("удалённый заказ не показывается", async () => {
    await db.order.update({ where: { id: orderId }, data: { deletedAt: new Date() } });
    expect(await findClientOrderStatus(orderNumber, "8 916 123-45-67")).toEqual({ ok: false, reason: "not-found" });
  });

  it("таблица «статус ERP → клиентский» из настроек: «создан» — «Подтверждён»", async () => {
    await makeNew();
    await saveClientStatusMapping({ orderStatuses: { NEW: "CONFIRMED" }, supplierStages: {} }, manager.id);
    const found = await findClientOrderStatus(orderNumber, "8 916 123-45-67");
    expect(found.ok && found.status.current).toBe("CONFIRMED");
  });

  it("оплата показывает правду даже у неподтверждённого заказа: полная — «Оплачен», часть — «Оплачен частично»", async () => {
    await makeNew();
    const paid = (amountKopecks: number) =>
      addPayment({ orderId, method: "INVOICE", amountKopecks, paidAt: new Date(), reference: null, user: manager });
    const paidStep = async () => {
      const found = await findClientOrderStatus(orderNumber, "8 916 123-45-67");
      expect(found.ok && found.status.current).toBe("RECEIVED");
      return found.ok ? found.status.steps.find((step) => step.key === "PAID") : undefined;
    };

    expect(await paidStep()).toMatchObject({ label: "Оплачен", state: "pending" });
    await paid(40_000);
    expect(await paidStep()).toMatchObject({ label: "Оплачен частично", state: "partial" });
    await paid(60_000);
    expect(await paidStep()).toMatchObject({ label: "Оплачен", state: "done", at: expect.any(String) });
  });

  it("отменённый заказ заканчивается шагом «Отменён»", async () => {
    await changeOrderStatus({ orderId, to: "CANCELLED", user: manager, cancelReason: "Передумал" });
    const found = await findClientOrderStatus(orderNumber, "8 916 123-45-67");
    expect(found.ok && found.status.headline).toBe("Отменён");
    expect(found.ok && found.status.steps.at(-1)?.key).toBe("CANCELLED");
  });

  it("частые попытки по одному номеру — «слишком часто»", async () => {
    for (let attempt = 0; attempt < 10; attempt++) await findClientOrderStatus(orderNumber, "+7 916 000-00-00");
    expect(await findClientOrderStatus(orderNumber, "8 916 123-45-67")).toEqual({ ok: false, reason: "too-many" });
  });
});
