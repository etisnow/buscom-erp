import "server-only";
import { hashPassword } from "better-auth/crypto";
import type { UserRole } from "@buscom/db/enums";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: Date;
  ordersCount: number;
};

export async function listUsers(): Promise<UserRow[]> {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      _count: { select: { managedOrders: true } },
    },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt,
    ordersCount: user._count.managedOrders,
  }));
}

export type CreateUserInput = {
  name: string;
  email: string;
  role: UserRole;
  password: string;
};

/**
 * Заведение пользователя администратором. Пароль временный — сотрудник меняет его сам
 * (саморегистрации в системе нет, PRD M8).
 *
 * Важно: Better Auth при входе ищет аккаунт с `accountId === user.id`, поэтому туда
 * пишется id пользователя, а не email (см. docs/DECISIONS.md).
 */
export async function createUser(input: CreateUserInput): Promise<{ id: string }> {
  const email = input.email.trim().toLowerCase();

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new Error("Пользователь с таким email уже есть");
  }

  const user = await db.user.create({
    data: { email, name: input.name.trim(), role: input.role, emailVerified: true },
    select: { id: true },
  });

  await db.account.create({
    data: {
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: await hashPassword(input.password),
    },
  });

  return user;
}

/** Смена роли. Снять с себя ADMIN нельзя — иначе можно остаться без администратора. */
export async function changeUserRole(userId: string, role: UserRole, actorId: string): Promise<void> {
  if (userId === actorId && role !== "ADMIN") {
    throw new ForbiddenError("Нельзя снять с себя роль администратора");
  }
  await db.user.update({ where: { id: userId }, data: { role } });
}

/**
 * Включение и отключение сотрудника. Деактивированный теряет все сессии сразу (PRD M8),
 * поэтому они удаляются в той же транзакции.
 */
export async function setUserActive(userId: string, isActive: boolean, actorId: string): Promise<void> {
  if (userId === actorId && !isActive) {
    throw new ForbiddenError("Нельзя отключить самого себя");
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { isActive } });
    if (!isActive) {
      await tx.session.deleteMany({ where: { userId } });
    }
  });
}

/** Выдача нового временного пароля вместо забытого. */
export async function resetUserPassword(userId: string, password: string): Promise<void> {
  const account = await db.account.findFirst({
    where: { userId, providerId: "credential" },
    select: { id: true },
  });

  const hash = await hashPassword(password);

  if (account) {
    await db.account.update({ where: { id: account.id }, data: { password: hash } });
  } else {
    await db.account.create({
      data: { userId, providerId: "credential", accountId: userId, password: hash },
    });
  }

  // Старые сессии после смены пароля недействительны.
  await db.session.deleteMany({ where: { userId } });
}
