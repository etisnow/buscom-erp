import type { UserRole } from "@/generated/prisma/enums";

/** Названия ролей для UI (PRD, «Пользователи и роли»). */
export const ROLE_LABELS: Record<UserRole, string> = {
  MANAGER: "Менеджер",
  HEAD: "Руководитель",
  ADMIN: "Администратор",
};

/** Роли, которым доступны экраны администрирования. */
export const ADMIN_ROLES: UserRole[] = ["ADMIN"];

/** Роли, которым виден раздел администрирования: руководителю — журнал интеграции на чтение. */
export const ADMIN_SECTION_ROLES: UserRole[] = ["ADMIN", "HEAD"];

/**
 * Роли, которым можно удалять клиента. Уже, чем правка карточки: удаление
 * необратимо, а PRD и заказы менеджеру удалять не даёт.
 */
export const CUSTOMER_DELETE_ROLES: UserRole[] = ["HEAD", "ADMIN"];

/** Роли, которые заводят и правят поставщиков и их цепочки этапов — как и каталог. */
export const SUPPLIER_EDIT_ROLES: UserRole[] = ["MANAGER", "HEAD", "ADMIN"];

/** Удаление поставщика необратимо — как и у клиента, только руководителю и администратору. */
export const SUPPLIER_DELETE_ROLES: UserRole[] = ["HEAD", "ADMIN"];

/** Роли, которым виден раздел «Аналитика»: выручка и маржа — не для менеджера (PRD, M7). */
export const ANALYTICS_ROLES: UserRole[] = ["HEAD", "ADMIN"];

/**
 * Роли, которым виден живой ящик в «Почте»: в нём вся почта компании — банк,
 * бухгалтерия, снабжение. Переписка с клиентами в ERP видна всем ролям.
 */
export const MAILBOX_ROLES: UserRole[] = ["HEAD", "ADMIN"];

/** Роли, которые могут создавать заказ вручную. */
export const ORDER_CREATE_ROLES: UserRole[] = ["MANAGER", "HEAD", "ADMIN"];

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export function hasRole(role: UserRole, allowed: UserRole[]): boolean {
  return allowed.includes(role);
}
