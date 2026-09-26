import "server-only";
import { normalizePhone } from "@buscom/domain/customer/phone";
import { hasCustomerRequisites, type CustomerRequisites } from "@buscom/domain/customer/requisites";
import { normalizeEnabledActions } from "@buscom/domain/supplier/actions";
import { isEmptyPriceFormula, type PriceFormula } from "@buscom/domain/supplier/price-economics";
import { normalizeStageNames, SupplierStageError } from "@buscom/domain/supplier/stages";
import { hasRole, SUPPLIER_DELETE_ROLES, SUPPLIER_EDIT_ROLES } from "@buscom/domain/user/role";
import { Prisma } from "@buscom/db/client";
import type { CustomerType } from "@buscom/db/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

export function canEditSuppliers(role: SessionUser["role"]): boolean {
  return hasRole(role, SUPPLIER_EDIT_ROLES);
}

export type SupplierDraft = {
  type: CustomerType;
  name: string;
  phone?: string | null;
  email?: string | null;
  inn?: string | null;
  kpp?: string | null;
  contactPerson?: string | null;
  address?: string | null;
  requisites?: CustomerRequisites | null;
  comment?: string | null;
};

/** Пустые строки из формы храним как NULL, реквизиты из одних пустых строк — тоже. */
function supplierData(draft: SupplierDraft) {
  const name = draft.name.trim();
  if (!name) throw new Error("Укажите имя или название поставщика");

  return {
    type: draft.type,
    name,
    phone: normalizePhone(draft.phone),
    email: draft.email?.trim().toLowerCase() || null,
    inn: draft.inn?.trim() || null,
    kpp: draft.kpp?.trim() || null,
    contactPerson: draft.contactPerson?.trim() || null,
    address: draft.address?.trim() || null,
    requisites: draft.requisites && hasCustomerRequisites(draft.requisites) ? draft.requisites : Prisma.DbNull,
    comment: draft.comment?.trim() || null,
  };
}

/**
 * Заведение поставщика. Дубли не ловим: сопоставлять поставщиков не с чем,
 * а одинаковое название у разных юрлиц встречается.
 */
export async function createSupplier(draft: SupplierDraft, user: SessionUser): Promise<{ id: string }> {
  if (!canEditSuppliers(user.role)) {
    throw new ForbiddenError("Заводить поставщиков может менеджер, руководитель или администратор");
  }
  return db.supplier.create({ data: supplierData(draft), select: { id: true } });
}

export async function updateSupplier(id: string, draft: SupplierDraft, user: SessionUser): Promise<void> {
  if (!canEditSuppliers(user.role)) {
    throw new ForbiddenError("Править поставщиков может менеджер, руководитель или администратор");
  }
  await db.supplier.update({ where: { id }, data: supplierData(draft) });
}

export type StageDraft = {
  /** id существующего этапа; без него этап новый */
  id?: string;
  name: string;
};

/**
 * Замена цепочки этапов целиком. Этапы сверяются по id, а не по позиции: треки
 * заказов ссылаются на этап, и переименование или перестановка их не сбивают.
 * Этап, на котором сейчас стоит хоть один заказ, удалить нельзя.
 */
export async function setSupplierStages(supplierId: string, stages: StageDraft[], user: SessionUser): Promise<void> {
  if (!canEditSuppliers(user.role)) {
    throw new ForbiddenError("Менять цепочку этапов может менеджер, руководитель или администратор");
  }

  const names = normalizeStageNames(stages.map((stage) => stage.name));

  await db.$transaction(async (tx) => {
    const existing = await tx.supplierStage.findMany({
      where: { supplierId },
      select: { id: true, name: true, _count: { select: { tracks: true } } },
    });
    const existingIds = new Set(existing.map((stage) => stage.id));

    for (const stage of stages) {
      if (stage.id && !existingIds.has(stage.id)) {
        throw new SupplierStageError("Этап не принадлежит этому поставщику — обновите страницу");
      }
    }

    const keptIds = new Set(stages.map((stage) => stage.id).filter(Boolean));
    const removed = existing.filter((stage) => !keptIds.has(stage.id));
    const busy = removed.filter((stage) => stage._count.tracks > 0);
    if (busy.length > 0) {
      const list = busy.map((stage) => `«${stage.name}»`).join(", ");
      throw new SupplierStageError(`Нельзя убрать этапы, на которых стоят заказы: ${list}`);
    }

    await tx.supplierStage.deleteMany({ where: { id: { in: removed.map((stage) => stage.id) } } });

    for (const [index, stage] of stages.entries()) {
      const data = { name: names[index], sortOrder: index };
      if (stage.id) {
        await tx.supplierStage.update({ where: { id: stage.id }, data });
      } else {
        await tx.supplierStage.create({ data: { ...data, supplierId } });
      }
    }
  });
}

/**
 * Действия и артефакты, включённые у поставщика (`packages/domain/src/supplier/actions.ts`) —
 * какие кнопки и загрузчики файлов видны у него в заказе. Отдельно от
 * основной формы (как цепочка этапов): свой чекбокс, своё сохранение.
 */
export async function setSupplierActions(supplierId: string, keys: string[], user: SessionUser): Promise<void> {
  if (!canEditSuppliers(user.role)) {
    throw new ForbiddenError("Менять действия поставщика может менеджер, руководитель или администратор");
  }
  await db.supplier.update({
    where: { id: supplierId },
    data: { enabledActions: normalizeEnabledActions(keys) },
  });
}

/**
 * «Экономика цены» поставщика. Отдельно от основной формы, как цепочка этапов.
 * Действует на заказы, в которых поставщик выбран после сохранения: в уже
 * выбранных позициях лежит снимок стоимости (`OrderItem.purchaseCostKopecks`).
 */
export async function setSupplierPriceFormula(
  supplierId: string,
  formula: PriceFormula,
  user: SessionUser,
): Promise<void> {
  if (!canEditSuppliers(user.role)) {
    throw new ForbiddenError("Менять экономику цены может менеджер, руководитель или администратор");
  }
  await db.supplier.update({
    where: { id: supplierId },
    data: { priceFormula: isEmptyPriceFormula(formula) ? Prisma.DbNull : formula },
  });
}

/** Комиссия с прибыли — сотые доли процента, от 0 (не удерживает) до 100%. */
export const PROFIT_COMMISSION_MAX = 10_000;

/**
 * «Комиссия с прибыли» поставщика. Как и «Экономика цены», действует на заказы,
 * где поставщик появится после сохранения: в уже заведённых — снимок у трека.
 */
export async function setSupplierProfitCommission(
  supplierId: string,
  hundredths: number,
  user: SessionUser,
): Promise<void> {
  if (!canEditSuppliers(user.role)) {
    throw new ForbiddenError("Менять комиссию с прибыли может менеджер, руководитель или администратор");
  }
  if (!Number.isInteger(hundredths) || hundredths < 0 || hundredths > PROFIT_COMMISSION_MAX) {
    throw new Error("Комиссия с прибыли — от 0 до 100%");
  }
  await db.supplier.update({ where: { id: supplierId }, data: { profitCommissionHundredths: hundredths } });
}

/**
 * Поставщика, который уже стоит в позициях заказов, не удаляем: в заказе
 * должно остаться, у кого брали товар. Привязки к товарам и цепочка уходят каскадом.
 */
export class SupplierInUseError extends Error {
  constructor(readonly ordersCount: number) {
    super(`Поставщик указан в заказах (${ordersCount}) — удалить нельзя`);
    this.name = "SupplierInUseError";
  }
}

export async function deleteSupplier(id: string, user: SessionUser): Promise<void> {
  if (!hasRole(user.role, SUPPLIER_DELETE_ROLES)) {
    throw new ForbiddenError("Удалять поставщиков может только руководитель или администратор");
  }

  const orders = await db.order.count({
    where: { OR: [{ items: { some: { supplierId: id } } }, { supplierTracks: { some: { supplierId: id } } }] },
  });
  if (orders > 0) throw new SupplierInUseError(orders);

  await db.supplier.delete({ where: { id } });
}
