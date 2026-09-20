import "server-only";
import { normalizePhone } from "@/domain/customer/phone";
import type { CustomerType } from "@/generated/prisma/enums";
import type { Tx } from "@/server/orders/internal";

export type CustomerDraft = {
  type?: CustomerType;
  name: string;
  phone?: string | null;
  email?: string | null;
  inn?: string | null;
  kpp?: string | null;
  comment?: string | null;
};

/**
 * Сопоставление клиента при приёме заказа (PRD, «Бизнес-правила»):
 * сначала по нормализованному телефону, потом по email без учёта регистра.
 * Найденного клиента не перезаписываем — новые данные остаются в заказе.
 *
 * По email сопоставляем, только если он ровно у одного клиента: почта бухгалтерии
 * бывает общей на несколько юрлиц, и тогда «первый попавшийся» привязал бы заказ
 * не к тому. Телефон такой оговорки не требует — он уникален в схеме.
 */
export async function findCustomer(tx: Tx, draft: CustomerDraft): Promise<{ id: string } | null> {
  const phone = normalizePhone(draft.phone);
  if (phone) {
    const byPhone = await tx.customer.findFirst({ where: { phone }, select: { id: true } });
    if (byPhone) return byPhone;
  }

  const email = draft.email?.trim().toLowerCase();
  if (email) {
    const byEmail = await tx.customer.findMany({ where: { email }, select: { id: true }, take: 2 });
    if (byEmail.length === 1) return byEmail[0]!;
  }

  return null;
}

/** Находит существующего клиента или заводит нового с нормализованным телефоном. */
export async function findOrCreateCustomer(tx: Tx, draft: CustomerDraft): Promise<{ id: string }> {
  const existing = await findCustomer(tx, draft);
  if (existing) return existing;

  return tx.customer.create({
    data: {
      type: draft.type ?? "PERSON",
      name: draft.name.trim(),
      phone: normalizePhone(draft.phone),
      email: draft.email?.trim().toLowerCase() ?? null,
      inn: draft.inn?.trim() ?? null,
      kpp: draft.kpp?.trim() ?? null,
      comment: draft.comment?.trim() ?? null,
    },
    select: { id: true },
  });
}
