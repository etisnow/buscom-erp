import { beforeEach, expect, it } from "vitest";
import { ProductOptionError } from "@buscom/domain/product/options";
import { createOrder } from "@/server/orders/create";
import { updateOrderItems } from "@/server/orders/items";
import { replaceProductOptions } from "@/server/products/service";
import type { SessionUser } from "@/server/session";
import { describeDb, resetDb, testDb } from "@/test/db";
import { makeProduct, makeUser } from "@/test/fixtures";

describeDb("опции товара в заказе (живая БД)", () => {
  let manager: SessionUser;

  beforeEach(async () => {
    await resetDb();
    manager = await makeUser("MANAGER");
  });

  /** Сиденье: базовая цена 10 000 ₽, обязательный ремень и необязательная опора. */
  async function seat() {
    const product = await makeProduct({ name: "Сиденье", priceKopecks: 1_000_000 });
    await testDb.$transaction((tx) =>
      replaceProductOptions(tx, product.id, [
        {
          name: "Ремень",
          required: true,
          values: [
            { name: "Двухточечный", priceDeltaKopecks: 145_000 },
            { name: "Трехточечный", priceDeltaKopecks: 175_000 },
          ],
        },
        { name: "Опора", required: false, values: [{ name: "Есть", priceDeltaKopecks: 175_000 }] },
      ]),
    );
    const values = await testDb.productOptionValue.findMany({ orderBy: { priceDeltaKopecks: "asc" } });
    const byName = Object.fromEntries(values.map((value) => [value.name, value.id]));
    return { product, byName };
  }

  function item(product: { id: string; sku: string; name: string }, optionValueIds: string[], priceKopecks: number) {
    return { productId: product.id, sku: product.sku, name: product.name, priceKopecks, quantity: 1, optionValueIds };
  }

  it("позиция хранит снимок опций, собранный на сервере", async () => {
    const { product, byName } = await seat();

    const order = await createOrder({
      customer: { name: "Клиент" },
      items: [item(product, [byName["Трехточечный"], byName["Есть"]], 1_350_000)],
      user: manager,
    });

    expect(order.items[0].options).toEqual([
      { valueId: byName["Трехточечный"], optionName: "Ремень", valueName: "Трехточечный", priceDeltaKopecks: 175_000 },
      { valueId: byName["Есть"], optionName: "Опора", valueName: "Есть", priceDeltaKopecks: 175_000 },
    ]);
  });

  it("без обязательной опции позицию не добавить", async () => {
    const { product, byName } = await seat();

    await expect(
      createOrder({ customer: { name: "Клиент" }, items: [item(product, [byName["Есть"]], 1_175_000)], user: manager }),
    ).rejects.toThrow(ProductOptionError);
  });

  it("правка опций в каталоге не ломает пересохранение старого заказа: снимок остаётся", async () => {
    const { product, byName } = await seat();
    const order = await createOrder({
      customer: { name: "Клиент" },
      items: [item(product, [byName["Двухточечный"]], 1_145_000)],
      user: manager,
    });

    // Опции в каталоге переделали — старых вариантов больше нет.
    await testDb.$transaction((tx) =>
      replaceProductOptions(tx, product.id, [
        { name: "Ремень", required: true, values: [{ name: "Новый", priceDeltaKopecks: 0 }] },
      ]),
    );

    const resaved = await updateOrderItems({
      orderId: order.id,
      items: [{ ...item(product, [byName["Двухточечный"]], 1_145_000), quantity: 2 }],
      user: manager,
    });
    expect(resaved.items[0].options).toEqual(order.items[0].options);
  });
});
