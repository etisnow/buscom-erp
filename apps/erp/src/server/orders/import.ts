import "server-only";
import { LEGACY_ITEM_SKU, parseLegacyOrder, type LegacyOrder } from "@/domain/order/legacy-import";
import { db } from "@/server/db";
import { resolveSystemSource } from "@/server/orders/source";

/**
 * Импорт заказов из прежней ERP (docs/STATUS.md, «Выгрузка заказов»).
 *
 * Решения владельца, на которых всё держится:
 * - позиций в источнике нет, поэтому у заказа ровно одна позиция на всю сумму;
 * - все перенесённые заказы получают статус «Выполнен» — это архив, вести его никто
 *   не будет, и в незакрытых статусах он бы засорял вкладки и «Просроченные»;
 * - номера 1..N отданы архиву, рабочие заказы сдвигаются выше.
 *
 * Идемпотентность — по `(source, externalId)`: уникальный ключ уже есть в схеме,
 * а `ID` строки прежней ERP уникален, в отличие от её номера заказа.
 */

export type OrderImportReport = {
  всего: number;
  создано: number;
  ужеБыло: number;
  пропущеноБезДаты: number;
  клиентНайден: number;
  клиентЗаведён: number;
  перенумерованоРабочих: number;
};

/**
 * Клиент ищется по имени, потом по email. По email — только если он ровно у одного:
 * общая почта бухгалтерии на несколько юрлиц привязала бы заказ не к тому.
 */
async function findCustomerId(draft: LegacyOrder): Promise<string | null> {
  if (draft.customerName) {
    const byName = await db.customer.findFirst({
      where: { name: { equals: draft.customerName, mode: "insensitive" } },
      select: { id: true },
    });
    if (byName) return byName.id;
  }

  if (draft.customerEmail) {
    const byEmail = await db.customer.findMany({
      where: { email: draft.customerEmail },
      select: { id: true },
      take: 2,
    });
    if (byEmail.length === 1) return byEmail[0]!.id;
  }

  return null;
}

/**
 * Архив занимает номера 1..N, а заказы, заведённые в этой системе, уезжают выше.
 * Иначе номера столкнулись бы: `Order.number` уникален.
 */
async function renumberWorkingOrders(reserved: number): Promise<number> {
  const working = await db.order.findMany({
    where: { source: { not: "LEGACY" }, number: { lte: reserved } },
    select: { id: true, number: true },
    orderBy: { number: "asc" },
  });
  if (working.length === 0) return 0;

  await db.$transaction(async (tx) => {
    // Двумя проходами: сначала в заведомо свободный диапазон отрицательных номеров,
    // иначе на первом же UPDATE можно налететь на собственный уникальный индекс.
    for (const order of working) {
      await tx.order.update({ where: { id: order.id }, data: { number: -order.number } });
    }
    for (const [index, order] of working.entries()) {
      await tx.order.update({ where: { id: order.id }, data: { number: reserved + index + 1 } });
    }
  });

  return working.length;
}

/** Следующий номер берётся из последовательности — её и двигаем за максимум. */
async function resetNumberSequence(): Promise<void> {
  await db.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"Order"', 'number'), (SELECT COALESCE(MAX("number"), 0) + 1 FROM "Order"), false)`,
  );
}

export type OrderImportOptions = {
  dryRun?: boolean;
  /** Без него скрипт откажется двигать номера уже заведённых заказов. */
  allowRenumber?: boolean;
  onProgress?: (done: number, total: number) => void;
};

export async function importLegacyOrders(
  rows: Record<string, string>[],
  options: OrderImportOptions = {},
): Promise<OrderImportReport> {
  const report: OrderImportReport = {
    всего: rows.length,
    создано: 0,
    ужеБыло: 0,
    пропущеноБезДаты: 0,
    клиентНайден: 0,
    клиентЗаведён: 0,
    перенумерованоРабочих: 0,
  };

  const drafts = rows
    .map(parseLegacyOrder)
    .filter((draft): draft is LegacyOrder => draft !== null)
    // Номер по дате: самый старый заказ становится первым — так архив читается
    // как история, а не как порядок строк в чужом файле.
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.externalId.localeCompare(b.externalId));

  report.пропущеноБезДаты = rows.length - drafts.length;

  if (!options.dryRun) {
    if (options.allowRenumber) {
      report.перенумерованоРабочих = await renumberWorkingOrders(drafts.length);
    } else {
      const clash = await db.order.count({ where: { source: { not: "LEGACY" }, number: { lte: drafts.length } } });
      if (clash > 0) {
        throw new Error(
          `Номера 1..${drafts.length} отданы архиву, но их занимают ${clash} заказов этой системы. ` +
            "Запустите с --renumber, чтобы сдвинуть их выше архива.",
        );
      }
    }
  }

  // Пункт справочника «Прежняя ERP»; в режиме проверки в базу не пишем ничего, даже его.
  const sourceItemId = options.dryRun ? null : await resolveSystemSource(db, "LEGACY");

  for (const [index, draft] of drafts.entries()) {
    const number = index + 1;

    const existing = await db.order.findUnique({
      where: { source_externalId: { source: "LEGACY", externalId: draft.externalId } },
      select: { id: true },
    });
    if (existing) {
      report.ужеБыло += 1;
      options.onProgress?.(index + 1, drafts.length);
      continue;
    }

    let customerId = await findCustomerId(draft);
    if (customerId) {
      report.клиентНайден += 1;
    } else {
      report.клиентЗаведён += 1;
      if (!options.dryRun) {
        const created = await db.customer.create({
          data: {
            name: draft.customerName || `Клиент заказа ${draft.externalId}`,
            email: draft.customerEmail,
            comment: "Заведён импортом заказов: в клиентской базе прежней ERP его не нашлось",
          },
          select: { id: true },
        });
        customerId = created.id;
      }
    }

    report.создано += 1;
    if (options.dryRun || !customerId) continue;

    await db.order.create({
      data: {
        number,
        source: "LEGACY",
        sourceItemId,
        externalId: draft.externalId,
        siteNumber: draft.siteNumber,
        status: "COMPLETED",
        customerId,
        itemsTotalKopecks: draft.totalKopecks + draft.discountKopecks,
        discountKopecks: draft.discountKopecks,
        deliveryPriceKopecks: 0,
        totalKopecks: draft.totalKopecks,
        paidKopecks: draft.paidKopecks,
        deliveryMethod: draft.deliveryMethod,
        carrier: draft.carrier,
        // Архив закрыт: срок контролировать не по чему, и в «Просроченных» ему не место.
        statusChangedAt: draft.createdAt,
        slaDueAt: null,
        createdAt: draft.createdAt,
        items: {
          create: [
            {
              sku: LEGACY_ITEM_SKU,
              name: draft.itemName,
              priceKopecks: draft.totalKopecks + draft.discountKopecks,
              quantity: 1,
              discountKopecks: 0,
            },
          ],
        },
        payments: draft.paidKopecks
          ? {
              create: [
                {
                  method: "INVOICE",
                  amountKopecks: draft.paidKopecks,
                  paidAt: draft.paidAt ?? draft.createdAt,
                  reference: "перенесено из прежней ERP",
                },
              ],
            }
          : undefined,
        events: {
          create: [{ type: "CREATED", toStatus: "COMPLETED", comment: draft.note, createdAt: draft.createdAt }],
        },
      },
    });

    options.onProgress?.(index + 1, drafts.length);
  }

  if (!options.dryRun) await resetNumberSequence();

  return report;
}
