import "server-only";
import { normalizePhone } from "@/domain/customer/phone";
import type { CustomerType } from "@/generated/prisma/enums";
import { findCustomer } from "@/server/customers/match";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/** Кто может заводить и править клиентов. */
const CUSTOMER_ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;

export function canEditCustomers(role: SessionUser["role"]): boolean {
  return CUSTOMER_ROLES.includes(role as (typeof CUSTOMER_ROLES)[number]);
}

/**
 * Клиент с таким телефоном или email уже заведён. Несёт его id и имя, чтобы форма
 * не просто отказала, а увела в карточку существующего (PRD, M2 — дубли сливают руками,
 * плодить их из интерфейса незачем).
 */
export class CustomerExistsError extends Error {
  constructor(
    readonly customerId: string,
    readonly customerName: string,
  ) {
    super(`Клиент «${customerName}» с таким телефоном или email уже есть`);
    this.name = "CustomerExistsError";
  }
}

export type NewCustomer = {
  type: CustomerType;
  name: string;
  phone?: string | null;
  email?: string | null;
  inn?: string | null;
  kpp?: string | null;
  comment?: string | null;
};

/**
 * Заведение клиента из интерфейса, до первого заказа (PRD, M2.4). Сопоставление —
 * то же, что при приёме заказа: сначала телефон, потом email. В отличие от
 * `findOrCreateCustomer` найденного клиента молча не возвращаем: человек нажал
 * «Новый клиент» и должен увидеть, что такой уже есть.
 */
export async function createCustomer(draft: NewCustomer, user: SessionUser): Promise<{ id: string }> {
  if (!canEditCustomers(user.role)) {
    throw new ForbiddenError("Заводить клиентов может менеджер, руководитель или администратор");
  }

  const name = draft.name.trim();
  if (!name) throw new Error("Укажите имя или название");

  return db.$transaction(async (tx) => {
    const existing = await findCustomer(tx, draft);
    if (existing) {
      const found = await tx.customer.findUniqueOrThrow({ where: { id: existing.id }, select: { name: true } });
      throw new CustomerExistsError(existing.id, found.name);
    }

    return tx.customer.create({
      data: {
        type: draft.type,
        name,
        phone: normalizePhone(draft.phone),
        email: draft.email?.trim().toLowerCase() || null,
        inn: draft.inn?.trim() || null,
        kpp: draft.kpp?.trim() || null,
        comment: draft.comment?.trim() || null,
      },
      select: { id: true },
    });
  });
}

export type CustomerUpdate = {
  type?: CustomerType;
  name?: string;
  phone?: string | null;
  email?: string | null;
  inn?: string | null;
  kpp?: string | null;
  comment?: string | null;
};

export async function updateCustomer(id: string, update: CustomerUpdate, user: SessionUser): Promise<void> {
  if (!canEditCustomers(user.role)) {
    throw new ForbiddenError("Править клиентов может менеджер, руководитель или администратор");
  }

  await db.customer.update({
    where: { id },
    data: {
      ...(update.type !== undefined ? { type: update.type } : {}),
      ...(update.name !== undefined ? { name: update.name.trim() } : {}),
      // Телефон всегда приводится к +7XXXXXXXXXX: по нему сопоставляются заказы с сайта.
      ...(update.phone !== undefined ? { phone: normalizePhone(update.phone) } : {}),
      ...(update.email !== undefined ? { email: update.email?.trim().toLowerCase() || null } : {}),
      ...(update.inn !== undefined ? { inn: update.inn?.trim() || null } : {}),
      ...(update.kpp !== undefined ? { kpp: update.kpp?.trim() || null } : {}),
      ...(update.comment !== undefined ? { comment: update.comment?.trim() || null } : {}),
    },
  });
}

export async function addCustomerAddress(
  customerId: string,
  address: { city?: string | null; address: string; isDefault?: boolean },
  user: SessionUser,
): Promise<void> {
  if (!canEditCustomers(user.role)) {
    throw new ForbiddenError("Адреса добавляет менеджер, руководитель или администратор");
  }
  const value = address.address.trim();
  if (!value) throw new Error("Адрес не может быть пустым");

  await db.$transaction(async (tx) => {
    // Адрес по умолчанию один: прежний снимаем в той же транзакции.
    if (address.isDefault) {
      await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    await tx.customerAddress.create({
      data: {
        customerId,
        city: address.city?.trim() || null,
        address: value,
        isDefault: address.isDefault ?? false,
      },
    });
  });
}

export async function deleteCustomerAddress(addressId: string, user: SessionUser): Promise<void> {
  if (!canEditCustomers(user.role)) {
    throw new ForbiddenError("Адреса удаляет менеджер, руководитель или администратор");
  }
  await db.customerAddress.delete({ where: { id: addressId } });
}

/**
 * Слияние дублей: заказы и адреса переезжают к основному клиенту, дубль удаляется
 * (PRD, M2 — «слияние дублей вручную»). Заполненные у дубля поля переносим,
 * если у основного клиента они пустые: данные не теряются.
 */
export async function mergeCustomers(targetId: string, duplicateId: string, user: SessionUser): Promise<void> {
  if (!canEditCustomers(user.role)) {
    throw new ForbiddenError("Сливать клиентов может менеджер, руководитель или администратор");
  }
  if (targetId === duplicateId) {
    throw new Error("Нельзя слить клиента с самим собой");
  }

  await db.$transaction(async (tx) => {
    const [target, duplicate] = await Promise.all([
      tx.customer.findUnique({ where: { id: targetId } }),
      tx.customer.findUnique({ where: { id: duplicateId } }),
    ]);
    if (!target || !duplicate) throw new Error("Один из клиентов не найден");

    await tx.order.updateMany({ where: { customerId: duplicateId }, data: { customerId: targetId } });

    // Адрес по умолчанию должен остаться один: у дубля свой был, поэтому при переносе
    // снимаем признак, если у основного клиента адрес по умолчанию уже есть.
    const targetHasDefault = await tx.customerAddress.findFirst({
      where: { customerId: targetId, isDefault: true },
      select: { id: true },
    });
    await tx.customerAddress.updateMany({
      where: { customerId: duplicateId },
      data: { customerId: targetId, ...(targetHasDefault ? { isDefault: false } : {}) },
    });

    await tx.customer.update({
      where: { id: targetId },
      data: {
        phone: target.phone ?? duplicate.phone,
        email: target.email ?? duplicate.email,
        inn: target.inn ?? duplicate.inn,
        kpp: target.kpp ?? duplicate.kpp,
        comment: [target.comment, duplicate.comment].filter(Boolean).join("\n") || null,
      },
    });

    await tx.customer.delete({ where: { id: duplicateId } });
  });
}
