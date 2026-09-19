import "server-only";
import type { InboxStatus } from "@/generated/prisma/enums";
import { db } from "@/server/db";

export type InboxRow = {
  id: string;
  source: string;
  externalId: string;
  status: InboxStatus;
  error: string | null;
  attempts: number;
  receivedAt: Date;
  processedAt: Date | null;
  orderNumber: number | null;
  payload: unknown;
};

export type InboxPage = {
  rows: InboxRow[];
  total: number;
  counts: Record<InboxStatus, number>;
};

const PAGE_SIZE = 50;

/** Журнал интеграции: что пришло с сайта, что разобралось, что упало (PRD, M8). */
export async function listInbox(status?: InboxStatus): Promise<InboxPage> {
  const where = status ? { status } : {};

  const [rows, total, pending, processed, failed] = await Promise.all([
    db.integrationInbox.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: PAGE_SIZE,
      select: {
        id: true,
        source: true,
        externalId: true,
        status: true,
        error: true,
        attempts: true,
        receivedAt: true,
        processedAt: true,
        payload: true,
        orderId: true,
      },
    }),
    db.integrationInbox.count({ where }),
    db.integrationInbox.count({ where: { status: "PENDING" } }),
    db.integrationInbox.count({ where: { status: "PROCESSED" } }),
    db.integrationInbox.count({ where: { status: "FAILED" } }),
  ]);

  const orderIds = rows.map((row) => row.orderId).filter((id): id is string => id !== null);
  const orders = orderIds.length
    ? await db.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } })
    : [];
  const numberById = new Map(orders.map((order) => [order.id, order.number]));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      source: row.source,
      externalId: row.externalId,
      status: row.status,
      error: row.error,
      attempts: row.attempts,
      receivedAt: row.receivedAt,
      processedAt: row.processedAt,
      orderNumber: row.orderId ? (numberById.get(row.orderId) ?? null) : null,
      payload: row.payload,
    })),
    total,
    counts: { PENDING: pending, PROCESSED: processed, FAILED: failed },
  };
}
