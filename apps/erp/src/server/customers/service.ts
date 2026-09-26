import "server-only";
import { normalizePhone } from "@buscom/domain/customer/phone";
import { hasCustomerRequisites, type CustomerRequisites } from "@buscom/domain/customer/requisites";
import { CUSTOMER_DELETE_ROLES, hasRole } from "@buscom/domain/user/role";
import { Prisma } from "@buscom/db/client";
import type { CustomerType } from "@buscom/db/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/** Кто может заводить и править клиентов. */
const CUSTOMER_ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;

export function canEditCustomers(role: SessionUser["role"]): boolean {
  return CUSTOMER_ROLES.includes(role as (typeof CUSTOMER_ROLES)[number]);
}

/**
 * Клиент с таким телефоном уже заведён. Несёт его id и имя, чтобы форма не просто
 * отказала, а увела в карточку существующего (PRD, M2 — дубли сливают руками,
 * плодить их из интерфейса незачем). По email не проверяем: одна почта бухгалтерии
 * на несколько юрлиц — обычное дело, и в схеме email не уникален.
 */
export class CustomerExistsError extends Error {
  constructor(
    readonly customerId: string,
    readonly customerName: string,
  ) {
    super(`Клиент «${customerName}» с таким телефоном уже есть`);
    this.name = "CustomerExistsError";
  }
}

export type NewCustomerAddress = { address: string; isDefault?: boolean };

export type NewCustomer = {
  type: CustomerType;
  name: string;
  phone?: string | null;
  email?: string | null;
  inn?: string | null;
  kpp?: string | null;
  contactPerson?: string | null;
  passport?: string | null;
  requisites?: CustomerRequisites | null;
  comment?: string | null;
  addresses?: NewCustomerAddress[];
};

/**
 * Заведение клиента из интерфейса, до первого заказа (PRD, M2.4). Дубль ловим по
 * телефону — он уникален в схеме. В отличие от `findOrCreateCustomer` найденного
 * клиента молча не возвращаем: человек нажал «Новый клиент» и должен увидеть,
 * что такой уже есть.
 */
export async function createCustomer(draft: NewCustomer, user: SessionUser): Promise<{ id: string }> {
  if (!canEditCustomers(user.role)) {
    throw new ForbiddenError("Заводить клиентов может менеджер, руководитель или администратор");
  }

  const name = draft.name.trim();
  if (!name) throw new Error("Укажите имя или название");

  const phone = normalizePhone(draft.phone);

  return db.$transaction(async (tx) => {
    if (phone) {
      const existing = await tx.customer.findUnique({ where: { phone }, select: { id: true, name: true } });
      if (existing) throw new CustomerExistsError(existing.id, existing.name);
    }

    // Пустые строки адресов отбрасываем: форма разрешает добавить строку и не заполнить её.
    const addresses = (draft.addresses ?? [])
      .map((item) => ({ address: item.address.trim(), isDefault: item.isDefault }))
      .filter((item) => item.address);

    // Адрес по умолчанию один, как и при добавлении из карточки: помеченный,
    // иначе первый — иначе у нового клиента не будет адреса по умолчанию вовсе.
    const defaultIndex = Math.max(
      addresses.findIndex((item) => item.isDefault),
      0,
    );

    return tx.customer.create({
      data: {
        type: draft.type,
        name,
        phone,
        email: draft.email?.trim().toLowerCase() || null,
        inn: draft.inn?.trim() || null,
        kpp: draft.kpp?.trim() || null,
        contactPerson: draft.contactPerson?.trim() || null,
        passport: draft.passport?.trim() || null,
        requisites: draft.requisites && hasCustomerRequisites(draft.requisites) ? draft.requisites : undefined,
        comment: draft.comment?.trim() || null,
        addresses: {
          create: addresses.map((item, index) => ({
            address: item.address,
            isDefault: index === defaultIndex,
          })),
        },
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
  contactPerson?: string | null;
  passport?: string | null;
  requisites?: CustomerRequisites | null;
  comment?: string | null;
};

export async function updateCustomer(id: string, update: CustomerUpdate, user: SessionUser): Promise<void> {
  if (!canEditCustomers(user.role)) {
    throw new ForbiddenError("Править клиентов может менеджер, руководитель или администратор");
  }

  // Телефон уникален: без этой проверки правка отдала бы сырое P2002 вместо понятного текста.
  const phone = update.phone !== undefined ? normalizePhone(update.phone) : undefined;
  if (phone) {
    const existing = await db.customer.findUnique({ where: { phone }, select: { id: true, name: true } });
    if (existing && existing.id !== id) throw new CustomerExistsError(existing.id, existing.name);
  }

  await db.customer.update({
    where: { id },
    data: {
      ...(update.type !== undefined ? { type: update.type } : {}),
      ...(update.name !== undefined ? { name: update.name.trim() } : {}),
      // Телефон всегда приводится к +7XXXXXXXXXX: по нему сопоставляются заказы с сайта.
      ...(update.phone !== undefined ? { phone } : {}),
      ...(update.email !== undefined ? { email: update.email?.trim().toLowerCase() || null } : {}),
      ...(update.inn !== undefined ? { inn: update.inn?.trim() || null } : {}),
      ...(update.kpp !== undefined ? { kpp: update.kpp?.trim() || null } : {}),
      ...(update.contactPerson !== undefined ? { contactPerson: update.contactPerson?.trim() || null } : {}),
      ...(update.passport !== undefined ? { passport: update.passport?.trim() || null } : {}),
      // Пустые реквизиты стираем в NULL: незачем хранить объект из одних пустых строк.
      ...(update.requisites !== undefined
        ? {
            requisites:
              update.requisites && hasCustomerRequisites(update.requisites) ? update.requisites : Prisma.DbNull,
          }
        : {}),
      ...(update.comment !== undefined ? { comment: update.comment?.trim() || null } : {}),
    },
  });
}

export async function addCustomerAddress(
  customerId: string,
  address: { address: string; isDefault?: boolean },
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
      data: { customerId, address: value, isDefault: address.isDefault ?? false },
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
 * Клиента с заказами не удаляем: заказ ссылается на него обязательным полем, и
 * без клиента карточка заказа осталась бы без покупателя. Считаем и удалённые
 * заказы (`deletedAt`) — строки в базе они занимают, и внешний ключ их держит.
 */
export class CustomerHasOrdersError extends Error {
  constructor(readonly ordersCount: number) {
    super(
      `За клиентом числятся заказы (${ordersCount}) — удалить нельзя. ` +
        "Если это дубль, объедините его с основным клиентом: заказы переедут туда.",
    );
    this.name = "CustomerHasOrdersError";
  }
}

/**
 * Удаление клиента. Физическое, а не `deletedAt`, как у заказов: у клиента без
 * заказов терять нечего, а телефон у него уникален — помеченная удалённой запись
 * навсегда заняла бы номер, и завести человека заново стало бы невозможно.
 * Адреса уезжают следом каскадом (`onDelete: Cascade` в схеме).
 */
export async function deleteCustomer(id: string, user: SessionUser): Promise<void> {
  if (!hasRole(user.role, CUSTOMER_DELETE_ROLES)) {
    throw new ForbiddenError("Удалять клиентов может только руководитель или администратор");
  }

  const customer = await db.customer.findUnique({
    where: { id },
    select: { _count: { select: { orders: true } } },
  });
  if (!customer) throw new Error("Клиент не найден");
  if (customer._count.orders > 0) throw new CustomerHasOrdersError(customer._count.orders);

  await db.customer.delete({ where: { id } });
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

    // Дубль удаляем ДО правки основного: телефон уникален, и перенос номера
    // с ещё живого дубля упёрся бы в индекс.
    await tx.customer.delete({ where: { id: duplicateId } });

    await tx.customer.update({
      where: { id: targetId },
      data: {
        phone: target.phone ?? duplicate.phone,
        email: target.email ?? duplicate.email,
        inn: target.inn ?? duplicate.inn,
        kpp: target.kpp ?? duplicate.kpp,
        contactPerson: target.contactPerson ?? duplicate.contactPerson,
        passport: target.passport ?? duplicate.passport,
        requisites: target.requisites ?? duplicate.requisites ?? Prisma.DbNull,
        comment: [target.comment, duplicate.comment].filter(Boolean).join("\n") || null,
      },
    });
  });
}
