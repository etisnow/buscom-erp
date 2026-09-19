import type { UserRole } from "@/generated/prisma/enums";

/** Названия ролей для UI (PRD, «Пользователи и роли»). */
export const ROLE_LABELS: Record<UserRole, string> = {
  MANAGER: "Менеджер",
  WAREHOUSE: "Склад",
  HEAD: "Руководитель",
  ADMIN: "Администратор",
};

/** Роли, которым доступны экраны администрирования. */
export const ADMIN_ROLES: UserRole[] = ["ADMIN"];

/** Роли, которые могут создавать заказ вручную. */
export const ORDER_CREATE_ROLES: UserRole[] = ["MANAGER", "HEAD", "ADMIN"];

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export function hasRole(role: UserRole, allowed: UserRole[]): boolean {
  return allowed.includes(role);
}
