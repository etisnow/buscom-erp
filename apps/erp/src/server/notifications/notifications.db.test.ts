import { beforeEach, expect, it, vi } from "vitest";
import { orderCreatedTopic, paymentStatusTopic, supplierStageTopic } from "@/domain/notification/topics";
import { dispatchNotifications, MAX_ATTEMPTS } from "@/server/notifications/dispatch";
import { createOrder } from "@/server/orders/create";
import { updateOrderItems } from "@/server/orders/items";
import { addPayment } from "@/server/orders/payments";
import { changeSupplierStage } from "@/server/orders/suppliers";
import { createSupplier, setSupplierStages } from "@/server/suppliers/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

const sendLetter = vi.hoisted(() => vi.fn<(letter: { to: string; subject: string; text: string }) => Promise<void>>());
vi.mock("@/server/mail", () => ({ sendLetter }));
// Отправку по таймеру в тестах не запускаем — очередь разбирается вызовом dispatchNotifications
vi.mock("@/server/notifications/dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/notifications/dispatch")>()),
  scheduleDispatch: () => {},
}));

const ORDER_CREATED = orderCreatedTopic("MANUAL");

describeDb("уведомления по событиям заказов (живая БД)", () => {
  let manager: SessionUser;
  let watcher: SessionUser;

  beforeEach(async () => {
    await resetDb();
    sendLetter.mockReset();
    sendLetter.mockResolvedValue(undefined);
    manager = await makeUser("MANAGER", "Автор");
    watcher = await makeUser("HEAD", "Наблюдатель");
  });

  async function subscribe(user: SessionUser, topics: string[]) {
    await testDb.user.update({ where: { id: user.id }, data: { notificationTopics: topics } });
  }

  async function setupOrder() {
    const { id: supplierId } = await createSupplier({ type: "COMPANY", name: "Прайд" }, manager);
    await setSupplierStages(supplierId, [{ name: "Заказано" }, { name: "Отгружено" }], manager);
    const stages = await testDb.supplierStage.findMany({ where: { supplierId }, orderBy: { sortOrder: "asc" } });
    const product = await makeProduct({ priceKopecks: 100_000 });
    await testDb.productSupplier.create({ data: { productId: product.id, supplierId, purchasePriceKopecks: 60_000 } });
    const item = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      priceKopecks: product.priceKopecks,
      quantity: 1,
      supplierId,
    };

    const order = await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });
    return { order, supplierId, stages, item };
  }

  it("новый заказ — письмо подписанному, автору — нет", async () => {
    await subscribe(watcher, [ORDER_CREATED]);
    await subscribe(manager, [ORDER_CREATED]);

    const { order } = await setupOrder();

    const queued = await testDb.notification.findMany();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ userId: watcher.id, topic: ORDER_CREATED, orderId: order.id });
    expect(queued[0].subject).toBe(`BusCom ERP: Новый заказ №${order.number}`);
  });

  it("подписка на заказы с сайта не срабатывает на заказ, заведённый вручную", async () => {
    await subscribe(watcher, [orderCreatedTopic("SITE")]);

    await setupOrder();

    expect(await testDb.notification.count()).toBe(0);
  });

  it("неподписанный и отключённый сотрудник писем не получают", async () => {
    await testDb.user.update({
      where: { id: watcher.id },
      data: { isActive: false, notificationTopics: [ORDER_CREATED] },
    });

    await setupOrder();

    expect(await testDb.notification.count()).toBe(0);
  });

  it("статус оплаты: платёж и правка состава, сдвинувшая оплату", async () => {
    const { order, item } = await setupOrder();
    await subscribe(watcher, [paymentStatusTopic("PAID"), paymentStatusTopic("PARTIAL")]);
    // Подписан только на «Переплату» — ни одно из писем ниже ему не положено
    const bystander = await makeUser("MANAGER", "Сосед");
    await subscribe(bystander, [paymentStatusTopic("OVERPAID")]);

    // 1000 ₽ из 1000 ₽ — «Не оплачен → Оплачен»
    await addPayment({ orderId: order.id, method: "CASH", amountKopecks: 100_000, paidAt: new Date(), user: manager });
    // Состав оплаченного заказа меняет только руководитель (domain/order/editing.ts)
    const head = await makeUser("HEAD", "Руководитель");
    // Вторая штука — итог 2000 ₽, оплата «Оплачен → Частично»
    await updateOrderItems({ orderId: order.id, items: [{ ...item, quantity: 2 }], user: head });
    // Скидка без смены статуса оплаты — письма нет
    await updateOrderItems({
      orderId: order.id,
      items: [{ ...item, quantity: 2, discountKopecks: 100 }],
      user: head,
    });

    const queued = await testDb.notification.findMany({ orderBy: { createdAt: "asc" } });
    expect(queued.map((row) => [row.userId, row.subject])).toEqual([
      [watcher.id, `BusCom ERP: Заказ №${order.number}: оплата — Оплачен`],
      [watcher.id, `BusCom ERP: Заказ №${order.number}: оплата — Частично`],
    ]);
  });

  it("этап поставщика — только по отмеченному этапу", async () => {
    const { order, supplierId, stages } = await setupOrder();
    await subscribe(watcher, [supplierStageTopic(stages[1].id)]);

    await changeSupplierStage({
      orderId: order.id,
      supplierId,
      toStageId: stages[0].id,
      expectedStageId: null,
      user: manager,
    });
    expect(await testDb.notification.count()).toBe(0);

    await changeSupplierStage({
      orderId: order.id,
      supplierId,
      toStageId: stages[1].id,
      expectedStageId: stages[0].id,
      user: manager,
    });

    const queued = await testDb.notification.findMany();
    expect(queued).toHaveLength(1);
    expect(queued[0].subject).toBe(`BusCom ERP: Заказ №${order.number}: Прайд — Отгружено`);
    expect(queued[0].text).toContain("Прайд: Заказано → Отгружено");
  });

  it("отправка: на свою почту, если задана; отправленное второй раз не уходит", async () => {
    await subscribe(watcher, [ORDER_CREATED]);
    await testDb.user.update({ where: { id: watcher.id }, data: { notificationEmail: "me@mail.ru" } });
    await setupOrder();

    expect(await dispatchNotifications()).toEqual({ sent: 1, failed: 0 });
    expect(sendLetter).toHaveBeenCalledTimes(1);
    expect(sendLetter.mock.calls[0][0].to).toBe("me@mail.ru");

    expect(await dispatchNotifications()).toEqual({ sent: 0, failed: 0 });
    expect(sendLetter).toHaveBeenCalledTimes(1);
  });

  it("ошибка отправки — попытка и текст ошибки, после предела попыток письмо не берётся", async () => {
    await subscribe(watcher, [ORDER_CREATED]);
    await setupOrder();
    sendLetter.mockRejectedValue(new Error("SMTP недоступен"));

    expect(await dispatchNotifications()).toEqual({ sent: 0, failed: 1 });
    const row = await testDb.notification.findFirstOrThrow();
    expect(row).toMatchObject({ attempts: 1, lastError: "SMTP недоступен", sentAt: null, claimedAt: null });

    await testDb.notification.update({ where: { id: row.id }, data: { attempts: MAX_ATTEMPTS } });
    expect(await dispatchNotifications()).toEqual({ sent: 0, failed: 0 });
    sendLetter.mockReset();
  });
});
