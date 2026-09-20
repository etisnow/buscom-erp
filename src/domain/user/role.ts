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

/** Роли, которые могут создавать заказ вручную. */
export const ORDER_CREATE_ROLES: UserRole[] = ["MANAGER", "HEAD", "ADMIN"];

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export function hasRole(role: UserRole, allowed: UserRole[]): boolean {
  return allowed.includes(role);
}
