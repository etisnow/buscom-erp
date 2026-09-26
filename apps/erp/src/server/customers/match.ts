import "server-only";
import { normalizeInn } from "@/domain/customer/company-lookup";
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
 * Сопоставление клиента при приёме заказа (PRD, «Бизнес-правила»).
 * Найденного клиента не перезаписываем — новые данные остаются в заказе.
 *
 * Заказ с ИНН ищет клиента только по ИНН: человек часто заказывает на свою
 * фирму со своего телефона, и поиск по телефону привязал бы заказ юрлица к
 * физлицу. Нет клиента с таким ИНН — заводим новое юрлицо. Несколько клиентов
 * с одним ИНН (филиалы, дубли из прежней ERP) — берём с тем же КПП, потом с тем
 * же телефоном или email, иначе самого давнего.
 *
 * Без ИНН — сначала по нормализованному телефону, потом по email без учёта регистра.
 *
 * По email сопоставляем, только если он ровно у одного клиента: почта бухгалтерии
 * бывает общей на несколько юрлиц, и тогда «первый попавшийся» привязал бы заказ
 * не к тому. Телефон такой оговорки не требует — он уникален в схеме.
 */
export async function findCustomer(tx: Tx, draft: CustomerDraft): Promise<{ id: string } | null> {
  const phone = normalizePhone(draft.phone);
  const email = draft.email?.trim().toLowerCase();

  const inn = normalizeInn(draft.inn);
  if (inn) {
    const sameInn = await tx.customer.findMany({
      where: { inn },
      select: { id: true, kpp: true, phone: true, email: true },
      orderBy: { createdAt: "asc" },
    });
    const kpp = draft.kpp?.trim();
    const match =
      (kpp ? sameInn.find((customer) => customer.kpp === kpp) : undefined) ??
      sameInn.find((customer) => (phone && customer.phone === phone) || (email && customer.email === email)) ??
      sameInn[0];
    return match ? { id: match.id } : null;
  }

  if (phone) {
    const byPhone = await tx.customer.findFirst({ where: { phone }, select: { id: true } });
    if (byPhone) return byPhone;
  }

  if (email) {
    const byEmail = await tx.customer.findMany({ where: { email }, select: { id: true }, take: 2 });
    if (byEmail.length === 1) return byEmail[0]!;
  }

  return null;
}

/**
 * Находит существующего клиента или заводит нового с нормализованным телефоном.
 * Телефон в базе уникален: если новое юрлицо пришло с телефоном, который уже
 * записан за другим клиентом (обычно — за физлицом, заказавшим на фирму),
 * в поле телефона новому клиенту его не пишем — только в комментарий карточки,
 * чтобы номер не потерялся (у заказа своего поля для телефона нет).
 */
export async function findOrCreateCustomer(tx: Tx, draft: CustomerDraft): Promise<{ id: string }> {
  const existing = await findCustomer(tx, draft);
  if (existing) return existing;

  const phone = normalizePhone(draft.phone);
  const phoneTaken = phone ? (await tx.customer.count({ where: { phone } })) > 0 : false;

  return tx.customer.create({
    data: {
      type: draft.type ?? "PERSON",
      name: draft.name.trim(),
      phone: phoneTaken ? null : phone,
      email: draft.email?.trim().toLowerCase() ?? null,
      inn: normalizeInn(draft.inn) ?? draft.inn?.trim() ?? null,
      kpp: draft.kpp?.trim() ?? null,
      comment:
        [draft.comment?.trim(), phoneTaken ? `Телефон ${phone} уже записан за другим клиентом` : null]
          .filter(Boolean)
          .join("\n") || null,
    },
    select: { id: true },
  });
}
