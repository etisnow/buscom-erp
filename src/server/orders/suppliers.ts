import "server-only";
import { OrderEditError } from "@/domain/order/editing";
import { assertStageMove, type TrackPosition } from "@/domain/supplier/stages";
import { db } from "@/server/db";
import { loadOrder, OrderConflictError, writeOrderEvent, type Tx } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

type ItemSupplierInput = {
  productId?: string | null;
  supplierId?: string | null;
  name: string;
};

type PreviousItem = {
  productId: string | null;
  supplierId: string | null;
  purchasePriceKopecks: number | null;
};

/**
 * Поставщик позиции и снимок закупочной цены. Цену берём из привязки товара к
 * поставщику на сервере — с клиента суммы не принимаются. Если такая же пара
 * товар–поставщик уже была в заказе, оставляем её прежний снимок: пересохранение
 * состава не должно молча переписывать закупку по новому прайсу.
 */
export async function resolveItemSuppliers(
  tx: Tx,
  items: ItemSupplierInput[],
  previous: PreviousItem[] = [],
): Promise<{ supplierId: string | null; purchasePriceKopecks: number | null }[]> {
  const pairs = items.filter((item) => item.supplierId);
  if (pairs.length === 0) return items.map(() => ({ supplierId: null, purchasePriceKopecks: null }));

  const links = await tx.productSupplier.findMany({
    where: {
      OR: pairs.map((item) => ({ productId: item.productId ?? "", supplierId: item.supplierId ?? "" })),
    },
    select: { productId: true, supplierId: true, purchasePriceKopecks: true },
  });
  const key = (productId: string | null | undefined, supplierId: string | null | undefined) =>
    `${productId ?? ""}:${supplierId ?? ""}`;
  const current = new Map(links.map((link) => [key(link.productId, link.supplierId), link.purchasePriceKopecks]));
  const snapshots = new Map(
    previous
      .filter((item) => item.supplierId && item.purchasePriceKopecks !== null)
      .map((item) => [key(item.productId, item.supplierId), item.purchasePriceKopecks]),
  );

  return items.map((item) => {
    if (!item.supplierId) return { supplierId: null, purchasePriceKopecks: null };

    const pair = key(item.productId, item.supplierId);
    const snapshot = snapshots.get(pair);
    if (snapshot !== undefined) return { supplierId: item.supplierId, purchasePriceKopecks: snapshot };

    const price = current.get(pair);
    if (price === undefined) {
      throw new OrderEditError(`У позиции «${item.name}» выбран поставщик, который её не поставляет`);
    }
    return { supplierId: item.supplierId, purchasePriceKopecks: price };
  });
}

/**
 * Треки поставщиков повторяют состав заказа: появился поставщик в позициях —
 * заводим трек «не начат», ушёл — убираем. Вызывается в той же транзакции,
 * что и запись позиций.
 */
export async function syncSupplierTracks(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId, supplierId: { not: null } },
    select: { supplierId: true },
  });
  const supplierIds = [...new Set(items.map((item) => item.supplierId as string))];

  await tx.orderSupplierTrack.deleteMany({ where: { orderId, supplierId: { notIn: supplierIds } } });
  if (supplierIds.length > 0) {
    await tx.orderSupplierTrack.createMany({
      data: supplierIds.map((supplierId) => ({ orderId, supplierId })),
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
