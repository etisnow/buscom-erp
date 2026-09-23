import "server-only";
import { OrderEditError } from "@/domain/order/editing";
import { purchaseWithOptions } from "@/domain/product/option-matching";
import { parseOrderItemOptions } from "@/domain/product/options";
import { calculateUnitCost, orderCostsTotal, parsePriceFormula } from "@/domain/supplier/price-economics";
import { assertStageMove, type TrackPosition } from "@/domain/supplier/stages";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { loadOrder, OrderConflictError, writeOrderEvent, type Tx } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

type ItemSupplierInput = {
  productId?: string | null;
  supplierId?: string | null;
  name: string;
  /** Выбранные варианты опций — у них бывает своя закупка у поставщика */
  optionValueIds?: string[];
};

type PreviousItem = {
  productId: string | null;
  supplierId: string | null;
  purchasePriceKopecks: number | null;
  purchaseCostKopecks?: number | null;
  /** Снимок опций позиции (`OrderItem.options`) — чтобы узнать прежний набор вариантов */
  options?: Prisma.JsonValue;
};

export type ItemSupplierSnapshot = {
  supplierId: string | null;
  purchasePriceKopecks: number | null;
  purchaseCostKopecks: number | null;
};

/**
 * Поставщик позиции и снимки закупки: номинал — базовая закупка пары
 * товар–поставщик плюс закупки выбранных вариантов опций (`purchaseWithOptions`),
 * стоимость для нас — номинал через «Экономику цены» поставщика. Считаем на
 * сервере — с клиента суммы не принимаются. Если такая же позиция (товар,
 * поставщик и набор вариантов) уже была в заказе, оставляем её прежние снимки:
 * пересохранение состава не должно молча переписывать закупку по новому прайсу.
 */
export async function resolveItemSuppliers(
  tx: Tx,
  items: ItemSupplierInput[],
  previous: PreviousItem[] = [],
): Promise<ItemSupplierSnapshot[]> {
  const empty: ItemSupplierSnapshot = { supplierId: null, purchasePriceKopecks: null, purchaseCostKopecks: null };
  const pairs = items.filter((item) => item.supplierId);
  if (pairs.length === 0) return items.map(() => empty);

  const links = await tx.productSupplier.findMany({
    where: {
      OR: pairs.map((item) => ({ productId: item.productId ?? "", supplierId: item.supplierId ?? "" })),
    },
    select: {
      productId: true,
      supplierId: true,
      purchasePriceKopecks: true,
      optionPrices: { select: { optionValueId: true, purchasePriceKopecks: true } },
      supplier: { select: { priceFormula: true } },
    },
  });
  const pairKey = (productId: string | null | undefined, supplierId: string | null | undefined) =>
    `${productId ?? ""}:${supplierId ?? ""}`;
  const itemKey = (productId: string | null | undefined, supplierId: string | null | undefined, valueIds: string[]) =>
    `${pairKey(productId, supplierId)}:${[...valueIds].sort().join(",")}`;
  const linkByPair = new Map(links.map((link) => [pairKey(link.productId, link.supplierId), link]));

  const snapshots = new Map(
    previous
      .filter((item) => item.supplierId && item.purchasePriceKopecks !== null)
      .map((item) => [
        itemKey(
          item.productId,
          item.supplierId,
          parseOrderItemOptions(item.options).map((option) => option.valueId),
        ),
        {
          purchasePriceKopecks: item.purchasePriceKopecks,
          // Позиции до «Экономики цены» без снимка стоимости — она равна номиналу
          purchaseCostKopecks: item.purchaseCostKopecks ?? item.purchasePriceKopecks,
        },
      ]),
  );

  return items.map((item) => {
    if (!item.supplierId) return empty;
    const valueIds = item.optionValueIds ?? [];

    const snapshot = snapshots.get(itemKey(item.productId, item.supplierId, valueIds));
    if (snapshot) return { supplierId: item.supplierId, ...snapshot };

    const link = linkByPair.get(pairKey(item.productId, item.supplierId));
    if (!link) {
      throw new OrderEditError(`У позиции «${item.name}» выбран поставщик, который её не поставляет`);
    }
    const purchasePriceKopecks = purchaseWithOptions(link.purchasePriceKopecks, link.optionPrices, valueIds);
    return {
      supplierId: item.supplierId,
      purchasePriceKopecks,
      purchaseCostKopecks: calculateUnitCost(purchasePriceKopecks, parsePriceFormula(link.supplier.priceFormula))
        .costKopecks,
    };
  });
}

/**
 * Треки поставщиков повторяют состав заказа: появился поставщик в позициях —
 * заводим трек «не начат», ушёл — убираем. Вызывается в той же транзакции,
 * что и запись позиций. Новый трек получает снимки расходов на заказ из
 * «Экономики цены» и комиссии с прибыли; у существующего они не меняются —
 * как и снимки в позициях.
 */
export async function syncSupplierTracks(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, supplierId: { not: null } },
    select: { supplierId: true },
  });
  const supplierIds = [...new Set(items.map((item) => item.supplierId as string))];

  await tx.orderSupplierTrack.deleteMany({ where: { orderId, supplierId: { notIn: supplierIds } } });
  if (supplierIds.length > 0) {
    const suppliers = await tx.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, priceFormula: true, profitCommissionHundredths: true },
    });
    const snapshot = new Map(
      suppliers.map((supplier) => [
        supplier.id,
        {
          orderCostKopecks: orderCostsTotal(parsePriceFormula(supplier.priceFormula)),
          profitCommissionHundredths: supplier.profitCommissionHundredths,
        },
      ]),
    );
    await tx.orderSupplierTrack.createMany({
      data: supplierIds.map((supplierId) => ({ orderId, supplierId, ...snapshot.get(supplierId) })),
      skipDuplicates: true,
    });
  }
}

/** Положение треков заказа для проверки перехода в `assertTransition`. */
export async function loadTrackPositions(tx: Tx, orderId: string): Promise<TrackPosition[]> {
  const tracks = await tx.orderSupplierTrack.findMany({
    where: { orderId },
    select: {
      stageId: true,
      supplier: { select: { name: true, stages: { orderBy: { sortOrder: "asc" }, select: { id: true } } } },
    },
  });

  return tracks.map((track) => {
    const index = track.supplier.stages.findIndex((stage) => stage.id === track.stageId);
    return {
      supplierName: track.supplier.name,
      stageIndex: index === -1 ? null : index,
      stagesCount: track.supplier.stages.length,
    };
  });
}

export type ChangeSupplierStageInput = {
  orderId: string;
  supplierId: string;
  /** Новый этап; null — вернуть в «не начат» */
  toStageId: string | null;
  /** Этап, который видел пользователь: защита от гонки двух менеджеров */
  expectedStageId: string | null;
  user: SessionUser;
};

/** Смена этапа поставщика в заказе: проверка по домену и запись в журнал одной транзакцией. */
export async function changeSupplierStage(input: ChangeSupplierStageInput): Promise<void> {
  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, input.orderId);

    const track = await tx.orderSupplierTrack.findUnique({
      where: { orderId_supplierId: { orderId: order.id, supplierId: input.supplierId } },
      select: {
        id: true,
        stageId: true,
        supplier: {
          select: { name: true, stages: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } } },
        },
      },
    });
    if (!track) throw new OrderConflictError("Этого поставщика в заказе уже нет — обновите страницу");
    if (track.stageId !== input.expectedStageId) {
      throw new OrderConflictError("Этап поставщика успели изменить — обновите страницу");
    }

    const stages = track.supplier.stages;
    const indexOf = (stageId: string | null) => {
      if (stageId === null) return null;
      const index = stages.findIndex((stage) => stage.id === stageId);
      return index === -1 ? -2 : index;
    };
    const fromIndex = indexOf(track.stageId);
    const toIndex = indexOf(input.toStageId);

    assertStageMove({
      orderStatus: order.status,
      role: input.user.role,
      fromIndex,
      // Этап из чужой цепочки превращаем в заведомо неверный индекс — домен его отклонит.
      toIndex,
      stagesCount: stages.length,
    });

    await tx.orderSupplierTrack.update({ where: { id: track.id }, data: { stageId: input.toStageId } });

    const label = (index: number | null) => (index === null || index < 0 ? "не начат" : stages[index].name);
    await writeOrderEvent(tx, {
      orderId: order.id,
      user: input.user,
      type: "SUPPLIER_STAGE_CHANGED",
      comment: `${track.supplier.name}: ${label(fromIndex)} → ${label(toIndex)}`,
      payload: { supplierId: input.supplierId, fromStageId: track.stageId, toStageId: input.toStageId },
    });
  });
}
