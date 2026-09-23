import "server-only";
import { z } from "zod";
import {
  isSiteOrderEmail,
  parseSiteEmail,
  siteEmailOrderNumber,
  type SiteEmail,
} from "@/domain/integration/site-email";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { createOrderFromPayload, type IngestResult } from "@/server/integrations/site-orders";

/**
 * Источник в журнале интеграции для писем с сайта. Отдельный от эндпоинта
 * (`site`): в журнале лежит само письмо, а не JSON контракта, и «Повторить»
 * должен разбирать его своим парсером.
 */
export const SITE_EMAIL_SOURCE = "site-email";

/** Письмо в том виде, в каком оно ложится в журнал интеграции. */
const storedEmailSchema = z.object({
  messageId: z.string().nullish(),
  from: z.string().nullish(),
  subject: z.string(),
  date: z.string().nullable(),
  html: z.string(),
  text: z.string(),
});

export type StoredEmail = z.infer<typeof storedEmailSchema>;

export type EmailIngestResult = IngestResult | { status: "skipped" };

/**
 * Приём письма из ящика заказов. Тот же порядок, что у эндпоинта: сначала письмо
 * целиком в журнал, потом разбор. Ключ идемпотентности — номер заказа на сайте:
 * одно письмо, прочитанное дважды, второго заказа не создаст.
 *
 * Письма, не похожие на заказ (ответы, рассылки), не трогаем и в журнал не пишем.
 */
export async function ingestSiteEmail(email: StoredEmail): Promise<EmailIngestResult> {
  if (!isSiteOrderEmail(email)) return { status: "skipped" };

  // Без номера письмо всё равно сохраняем — по Message-ID, чтобы разобрать руками.
  const externalId = siteEmailOrderNumber(email) ?? `message:${email.messageId ?? email.subject}`;

  const existing = await db.integrationInbox.findUnique({
    where: { source_externalId: { source: SITE_EMAIL_SOURCE, externalId } },
    select: { id: true, orderId: true },
  });
  if (existing?.orderId) {
    const order = await db.order.findUnique({ where: { id: existing.orderId }, select: { number: true } });
    if (order) return { status: 200, orderNumber: order.number, duplicate: true };
  }

  const payload = email as Prisma.InputJsonValue;
  const inbox = existing
    ? await db.integrationInbox.update({
        where: { id: existing.id },
        data: { payload, attempts: { increment: 1 }, status: "PENDING" },
        select: { id: true },
      })
    : await db.integrationInbox.create({
        data: { source: SITE_EMAIL_SOURCE, externalId, payload, attempts: 1 },
        select: { id: true },
      });

  return processStoredEmail(inbox.id, email);
}

/** Повтор записи журнала с письмом — кнопка «Повторить». */
export async function retrySiteEmail(inboxId: string, payload: unknown): Promise<IngestResult> {
  const email = storedEmailSchema.safeParse(payload);
  if (!email.success) return fail(inboxId, "В записи журнала нет письма — разобрать нечего");

  await db.integrationInbox.update({
    where: { id: inboxId },
    data: { attempts: { increment: 1 }, status: "PENDING" },
  });
  return processStoredEmail(inboxId, email.data);
}

async function processStoredEmail(inboxId: string, email: SiteEmail): Promise<IngestResult> {
  const parsed = parseSiteEmail(email);
  if (!parsed.ok) return fail(inboxId, parsed.error);

  const { order, paymentMethod } = parsed.value;

  // Тот же заказ мог прийти и другим путём (эндпоинтом, когда он появится) —
  // заказ с сайта уникален по номеру, второй не заводим.
  const already = await db.order.findUnique({
    where: { source_externalId: { source: "SITE", externalId: order.externalId } },
    select: { id: true, number: true },
  });
  if (already) {
    await db.integrationInbox.update({
      where: { id: inboxId },
      data: { status: "PROCESSED", orderId: already.id, error: null, processedAt: new Date() },
    });
    return { status: 200, orderNumber: already.number, duplicate: true };
  }

  try {
    const orderNumber = await createOrderFromPayload(order, inboxId, {
      eventComment: [
        `Заказ принят из письма сайта, № на сайте ${order.externalId}`,
        paymentMethod ? `способ оплаты на сайте: ${paymentMethod}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    });
    return { status: 201, orderNumber };
  } catch (error) {
    return fail(inboxId, error instanceof Error ? error.message : "Неизвестная ошибка при создании заказа");
  }
}

async function fail(inboxId: string, error: string): Promise<IngestResult> {
  await db.integrationInbox.update({
    where: { id: inboxId },
    data: { status: "FAILED", error, processedAt: new Date() },
  });
  return { status: 202, inboxId, error };
}
