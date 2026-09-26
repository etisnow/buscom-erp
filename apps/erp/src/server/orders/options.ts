import "server-only";
import type { Prisma } from "@buscom/db/client";
import { buildOptionSnapshot, parseOrderItemOptions, type OrderItemOption } from "@/domain/product/options";
import { OrderEditError } from "@/domain/order/editing";
import type { Tx } from "@/server/orders/internal";

type ItemOptionsInput = {
  productId?: string | null;
  name: string;
  optionValueIds?: string[];
};

type PreviousItem = { productId: string | null; options: Prisma.JsonValue };

const key = (productId: string | null | undefined, valueIds: readonly string[]) =>
  `${productId ?? ""}:${[...valueIds].sort().join(",")}`;

/**
 * Снимок опций для каждой позиции. Названия и надбавки берём из каталога на
 * сервере, с клиента приходят только id вариантов. Если та же позиция (товар и
 * набор вариантов) уже была в заказе, оставляем её прежний снимок: пересохранение
 * состава не должно ломаться оттого, что опции в каталоге поправили или удалили.
 */
export async function resolveItemOptions(
  tx: Tx,
  items: ItemOptionsInput[],
  previous: PreviousItem[] = [],
): Promise<Prisma.InputJsonValue[] | undefined[]> {
  const productIds = [...new Set(items.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
  const products = productIds.length
    ? await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          options: {
            orderBy: { sortOrder: "asc" },
            select: {
              id: true,
              name: true,
              required: true,
              values: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, priceDeltaKopecks: true } },
            },
          },
        },
      })
    : [];
  const groupsByProduct = new Map(products.map((product) => [product.id, product.options]));

  const snapshots = new Map<string, OrderItemOption[]>();
  for (const item of previous) {
    const options = parseOrderItemOptions(item.options);
    if (options.length > 0)
      snapshots.set(
        key(
          item.productId,
          options.map((option) => option.valueId),
        ),
        options,
      );
  }

  return items.map((item) => {
    const valueIds = item.optionValueIds ?? [];
    const kept = snapshots.get(key(item.productId, valueIds));
    if (kept && valueIds.length > 0) return kept as unknown as Prisma.InputJsonValue;

    if (!item.productId) {
      if (valueIds.length > 0) throw new OrderEditError(`У произвольной позиции «${item.name}» опций быть не может`);
      return undefined;
    }

    const snapshot = buildOptionSnapshot(groupsByProduct.get(item.productId) ?? [], valueIds, item.name);
    return snapshot.length > 0 ? (snapshot as unknown as Prisma.InputJsonValue) : undefined;
  }) as Prisma.InputJsonValue[] | undefined[];
}
