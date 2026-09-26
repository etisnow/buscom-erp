import "server-only";
import type { InboxStatus } from "@buscom/db/enums";
import { db } from "@/server/db";
import { retrySiteEmail, SITE_EMAIL_SOURCE } from "@/server/integrations/site-email";
import { ingestSiteOrder, type IngestResult } from "@/server/integrations/site-orders";

/** Названия источников для журнала — в базе лежат технические ключи. */
const INBOX_SOURCE_LABELS: Record<string, string> = {
  site: "Сайт (API)",
  [SITE_EMAIL_SOURCE]: "Сайт (письмо)",
};

/**
 * Повторная обработка записи журнала — кнопка «Повторить» на экране интеграции.
 * Письмо разбирается своим парсером, JSON эндпоинта — контрактом.
 */
export async function retryInboxEntry(inboxId: string): Promise<IngestResult> {
  const entry = await db.integrationInbox.findUnique({
    where: { id: inboxId },
    select: { source: true, payload: true },
  });
  if (!entry) return { status: 400, error: "Запись журнала не найдена" };
  if (entry.source === SITE_EMAIL_SOURCE) return retrySiteEmail(inboxId, entry.payload);
  return ingestSiteOrder(entry.payload);
}

export type InboxRow = {
  id: string;
  source: string;
  sourceLabel: string;
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
      sourceLabel: INBOX_SOURCE_LABELS[row.source] ?? row.source,
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
