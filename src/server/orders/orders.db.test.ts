import { beforeEach, expect, it } from "vitest";
import { createOrder } from "@/server/orders/create";
import { updateOrderItems } from "@/server/orders/items";
import { addPayment } from "@/server/orders/payments";
import { changeOrderStatus } from "@/server/orders/status";
import { takeOrder, assignManager } from "@/server/orders/assignment";
import { addOrderComment } from "@/server/orders/comments";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

describeDb("сервис заказов (живая БД)", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ручное создание кладёт заказ в работу и пишет событие CREATED", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct({ priceKopecks: 100_000 });

    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Иван Иванов", phone: "8 916 123-45-67" },
      items: [
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          priceKopecks: product.priceKopecks,
          quantity: 2,
        },
      ],
      user: manager,
    });

    expect(order.status).toBe("IN_PROGRESS");
    expect(order.managerId).toBe(manager.id);
    expect(order.totalKopecks).toBe(200_000);

    const events = await testDb.orderEvent.findMany({ where: { orderId: order.id } });
    expect(events.map((event) => event.type)).toEqual(["CREATED"]);

    // Телефон сохраняется нормализованным — по нему ищутся дубли клиентов.
    const customer = await testDb.customer.findUniqueOrThrow({ where: { id: order.customerId } });
    expect(customer.phone).toBe("+79161234567");
  });

  it("сумма заказа считается сервером, а не берётся с клиента", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct({ priceKopecks: 33_333 });

    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [{ productId: product.id, sku: product.sku, name: product.name, priceKopecks: 33_333, quantity: 3 }],
      deliveryPriceKopecks: 50_000,
      user: manager,
    });

    expect(order.itemsTotalKopecks).toBe(99_999);
    expect(order.totalKopecks).toBe(149_999);
  });

  it("скидка выше лимита отклоняется у менеджера и проходит у руководителя", async () => {
    const manager = await makeUser("MANAGER");
    const head = await makeUser("HEAD");
    const product = await makeProduct({ priceKopecks: 100_000 });
    const item = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      priceKopecks: 100_000,
      quantity: 1,
    };

    await expect(
      createOrder({
        source: "PHONE",
        customer: { name: "Клиент" },
        items: [item],
        discountKopecks: 20_000,
        user: manager,
      }),
    ).rejects.toThrow(/превышает лимит/);

    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [item],
      discountKopecks: 20_000,
      user: head,
    });
    expect(order.discountKopecks).toBe(20_000);
  });

  it("недопустимый переход отклоняется, даже если вызвать сервис напрямую", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct();

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

    await expect(changeOrderStatus({ orderId: order.id, to: "COMPLETED", user: manager })).rejects.toThrow(
      /не предусмотрен/,
    );

    const fresh = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.status).toBe("IN_PROGRESS");
  });

  it("отмена без причины не проходит", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct();
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

    await expect(changeOrderStatus({ orderId: order.id, to: "CANCELLED", user: manager })).rejects.toThrow(/причину/);
  });

  it("отмену оплаченного заказа менеджер не делает, а руководитель — делает", async () => {
    const manager = await makeUser("MANAGER");
    const head = await makeUser("HEAD");
    const product = await makeProduct({ priceKopecks: 100_000 });

    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [{ productId: product.id, sku: product.sku, name: product.name, priceKopecks: 100_000, quantity: 1 }],
      user: manager,
    });
    await addPayment({
      orderId: order.id,
      method: "INVOICE",
      amountKopecks: 100_000,
      paidAt: new Date(),
      user: manager,
    });

    await expect(
      changeOrderStatus({
        orderId: order.id,
        to: "CANCELLED",
        user: manager,
        cancelReason: "Клиент передумал",
      }),
    ).rejects.toThrow(/только руководитель/);

    const cancelled = await changeOrderStatus({
      orderId: order.id,
      to: "CANCELLED",
      user: head,
      cancelReason: "Клиент передумал",
    });
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("оплата статус заказа не меняет: статуса «Оплачен» больше нет", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct({ priceKopecks: 100_000 });

    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [{ productId: product.id, sku: product.sku, name: product.name, priceKopecks: 100_000, quantity: 1 }],
      user: manager,
    });

    const paid = await addPayment({
      orderId: order.id,
      method: "INVOICE",
      amountKopecks: 100_000,
      paidAt: new Date(),
      user: manager,
    });
    expect(paid.status).toBe("IN_PROGRESS");
    expect(paid.paidKopecks).toBe(100_000);
    expect(await testDb.orderEvent.count({ where: { orderId: order.id, type: "STATUS_CHANGED" } })).toBe(0);
  });

  it("«взять себе» не перехватывает чужой заказ", async () => {
    const first = await makeUser("MANAGER", "Первый менеджер");
    const second = await makeUser("MANAGER", "Второй менеджер");
    const product = await makeProduct();

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
      user: first,
    });

    await expect(takeOrder(order.id, second)).rejects.toThrow(/уже в работе у Первый менеджер/);
  });

  it("переназначить менеджера может только руководитель", async () => {
    const manager = await makeUser("MANAGER");
    const other = await makeUser("MANAGER", "Другой менеджер");
    const head = await makeUser("HEAD");
    const product = await makeProduct();

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

    await expect(assignManager(order.id, other.id, manager)).rejects.toThrow(/только руководитель/);

    const reassigned = await assignManager(order.id, other.id, head);
    expect(reassigned.managerId).toBe(other.id);
  });

  it("правка состава пересчитывает итог и пишет событие с прежним составом", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct({ priceKopecks: 100_000 });
    const item = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      priceKopecks: 100_000,
      quantity: 1,
    };

    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [item],
      user: manager,
    });

    const updated = await updateOrderItems({
      orderId: order.id,
      items: [{ ...item, quantity: 3 }],
      user: manager,
    });
    expect(updated.totalKopecks).toBe(300_000);

    const event = await testDb.orderEvent.findFirst({
      where: { orderId: order.id, type: "ITEMS_CHANGED" },
    });
    expect(event).not.toBeNull();
    expect(JSON.stringify(event?.payload)).toContain("100000");
  });

  it("каждое действие оставляет след в журнале", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct({ priceKopecks: 100_000 });

    const order = await createOrder({
      source: "PHONE",
      customer: { name: "Клиент" },
      items: [{ productId: product.id, sku: product.sku, name: product.name, priceKopecks: 100_000, quantity: 1 }],
      user: manager,
    });
    await addPayment({
      orderId: order.id,
      method: "INVOICE",
      amountKopecks: 100_000,
      paidAt: new Date(),
      user: manager,
    });
    await addOrderComment(order.id, "Клиент просил позвонить после 14:00", manager);
    await changeOrderStatus({ orderId: order.id, to: "COMPLETED", user: manager });

    const events = await testDb.orderEvent.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events.map((event) => event.type)).toEqual(["CREATED", "PAYMENT_ADDED", "COMMENT", "STATUS_CHANGED"]);
  });

  it("гонка двух менеджеров: несовпадение ожидаемого статуса отклоняется", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct();

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
    // Второй менеджер видел заказ ещё «Созданным», а он уже в работе.
    await expect(
      changeOrderStatus({
        orderId: order.id,
        to: "COMPLETED",
        user: manager,
        expectedStatus: "NEW",
      }),
    ).rejects.toThrow(/успели изменить/);
  });

  it("удалённый заказ для сервиса не существует", async () => {
    const manager = await makeUser("MANAGER");
    const product = await makeProduct();

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
    await testDb.order.update({ where: { id: order.id }, data: { deletedAt: new Date() } });

    await expect(changeOrderStatus({ orderId: order.id, to: "COMPLETED", user: manager })).rejects.toThrow(/не найден/);
  });
});
