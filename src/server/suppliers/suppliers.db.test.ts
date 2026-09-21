import { beforeEach, expect, it } from "vitest";
import { OrderEditError } from "@/domain/order/editing";
import { OrderTransitionError } from "@/domain/order/status";
import { SupplierStageError } from "@/domain/supplier/stages";
import { createOrder } from "@/server/orders/create";
import { updateOrderItems } from "@/server/orders/items";
import { changeOrderStatus } from "@/server/orders/status";
import { changeSupplierStage } from "@/server/orders/suppliers";
import { updateProduct } from "@/server/products/service";
import { createSupplier, deleteSupplier, setSupplierStages, SupplierInUseError } from "@/server/suppliers/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

describeDb("поставщики и их цепочки в заказе (живая БД)", () => {
  let manager: SessionUser;
  let head: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
    head = await makeUser("HEAD");
  });

  /** Поставщик с цепочкой из трёх этапов и товар, привязанный к нему по закупке 600 ₽. */
  async function setup() {
    const { id: supplierId } = await createSupplier({ type: "COMPANY", name: "Автокомплект" }, manager);
    await setSupplierStages(
      supplierId,
      [{ name: "Запрошен счёт" }, { name: "Оплачено поставщику" }, { name: "Получено" }],
      manager,
    );
    const stages = await testDb.supplierStage.findMany({ where: { supplierId }, orderBy: { sortOrder: "asc" } });

    const product = await makeProduct({ priceKopecks: 100_000 });
    await updateProduct(product.id, { suppliers: [{ supplierId, purchasePriceKopecks: 60_000 }] }, manager);

    const item = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      priceKopecks: product.priceKopecks,
      quantity: 2,
      supplierId,
    };
    return { supplierId, stages, product, item };
  }

  it("цепочка этапов сохраняется по порядку, переименование и перестановка не меняют id", async () => {
    const { supplierId, stages } = await setup();
    expect(stages.map((stage) => stage.name)).toEqual(["Запрошен счёт", "Оплачено поставщику", "Получено"]);

    await setSupplierStages(
      supplierId,
      [
        { id: stages[1].id, name: "Оплачено" },
        { id: stages[0].id, name: "Запрошен счёт" },
        { id: stages[2].id, name: "Получено на склад перевозчика" },
      ],
      manager,
    );

    const after = await testDb.supplierStage.findMany({ where: { supplierId }, orderBy: { sortOrder: "asc" } });
    expect(after.map((stage) => [stage.id, stage.name])).toEqual([
      [stages[1].id, "Оплачено"],
      [stages[0].id, "Запрошен счёт"],
      [stages[2].id, "Получено на склад перевозчика"],
    ]);
  });

  it("заказ с товаром поставщика: снимок закупки и трек «не начат»", async () => {
    const { supplierId, item } = await setup();

    const order = await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });

    expect(order.items[0]).toMatchObject({ supplierId, purchasePriceKopecks: 60_000 });
    const tracks = await testDb.orderSupplierTrack.findMany({ where: { orderId: order.id } });
    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({ supplierId, stageId: null });
  });

  it("поставщика, который не поставляет товар, выбрать нельзя", async () => {
    const { item } = await setup();
    const { id: stranger } = await createSupplier({ type: "COMPANY", name: "Чужой" }, manager);

    await expect(
      createOrder({
        source: "PHONE",
        customer: { name: "Клиент" },
        items: [{ ...item, supplierId: stranger }],
        user: manager,
      }),
    ).rejects.toThrow(OrderEditError);
  });

  it("этапы идут по порядку, смена пишется в журнал", async () => {
    const { supplierId, stages, item } = await setup();
    const order = await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });

    await expect(
      changeSupplierStage({
        orderId: order.id,
        supplierId,
        toStageId: stages[1].id,
        expectedStageId: null,
        user: manager,
      }),
    ).rejects.toThrow(SupplierStageError);

    await changeSupplierStage({
      orderId: order.id,
      supplierId,
      toStageId: stages[0].id,
      expectedStageId: null,
      user: manager,
    });

    const track = await testDb.orderSupplierTrack.findFirstOrThrow({ where: { orderId: order.id } });
    expect(track.stageId).toBe(stages[0].id);

    const event = await testDb.orderEvent.findFirstOrThrow({
      where: { orderId: order.id, type: "SUPPLIER_STAGE_CHANGED" },
    });
    expect(event.comment).toBe("Автокомплект: не начат → Запрошен счёт");
  });

  it("устаревший этап на экране — конфликт, а не молчаливая перезапись", async () => {
    const { supplierId, stages, item } = await setup();
    const order = await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });
    await changeSupplierStage({
      orderId: order.id,
      supplierId,
      toStageId: stages[0].id,
      expectedStageId: null,
      user: manager,
    });

    await expect(
      changeSupplierStage({
        orderId: order.id,
        supplierId,
        toStageId: stages[0].id,
        expectedStageId: null,
        user: manager,
      }),
    ).rejects.toThrow(/успели изменить/);
  });

  it("в «Отправку» заказ уходит только после последнего этапа поставщика", async () => {
    const { supplierId, stages, item } = await setup();
    const order = await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });

    await expect(changeOrderStatus({ orderId: order.id, to: "SHIPPING", user: manager })).rejects.toThrow(
      OrderTransitionError,
    );

    let current: string | null = null;
    for (const stage of stages) {
      await changeSupplierStage({
        orderId: order.id,
        supplierId,
        toStageId: stage.id,
        expectedStageId: current,
        user: manager,
      });
      current = stage.id;
    }

    await changeOrderStatus({ orderId: order.id, to: "SHIPPING", user: manager });
    const fresh = await testDb.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(fresh.status).toBe("SHIPPING");

    // Заказ ушёл из работы — этапы заморожены.
    await expect(
      changeSupplierStage({
        orderId: order.id,
        supplierId,
        toStageId: stages[1].id,
        expectedStageId: stages[2].id,
        user: manager,
      }),
    ).rejects.toThrow(/пока заказ в работе/);
  });

  it("пересохранение состава держит снимок закупки; ушёл поставщик — ушёл и трек", async () => {
    const { supplierId, product, item } = await setup();
    const order = await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });

    // Прайс поставщика подорожал — в уже оформленном заказе закупка прежняя.
    await updateProduct(product.id, { suppliers: [{ supplierId, purchasePriceKopecks: 75_000 }] }, manager);
    const resaved = await updateOrderItems({ orderId: order.id, items: [{ ...item, quantity: 3 }], user: manager });
    expect(resaved.items[0].purchasePriceKopecks).toBe(60_000);

    await updateOrderItems({ orderId: order.id, items: [{ ...item, supplierId: null }], user: manager });
    expect(await testDb.orderSupplierTrack.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("этап, на котором стоит заказ, из цепочки не убрать", async () => {
    const { supplierId, stages, item } = await setup();
    const order = await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });
    await changeSupplierStage({
      orderId: order.id,
      supplierId,
      toStageId: stages[0].id,
      expectedStageId: null,
      user: manager,
    });

    await expect(setSupplierStages(supplierId, [{ id: stages[1].id, name: stages[1].name }], manager)).rejects.toThrow(
      /Запрошен счёт/,
    );
  });

  it("поставщика из заказов не удалить, свободного — можно, и только руководителю", async () => {
    const { supplierId, item } = await setup();
    await createOrder({ source: "PHONE", customer: { name: "Клиент" }, items: [item], user: manager });

    await expect(deleteSupplier(supplierId, head)).rejects.toThrow(SupplierInUseError);

    const { id: free } = await createSupplier({ type: "PERSON", name: "Свободный" }, manager);
    await expect(deleteSupplier(free, manager)).rejects.toThrow(/руководитель/);
    await deleteSupplier(free, head);
    expect(await testDb.supplier.count({ where: { id: free } })).toBe(0);
  });
});
