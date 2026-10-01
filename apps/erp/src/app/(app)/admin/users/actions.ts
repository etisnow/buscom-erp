"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { ForbiddenError } from "@/server/errors";
import {
  changeUserJobFunction,
  changeUserRole,
  createUser,
  renameUser,
  resetUserPassword,
  setUserActive,
} from "@/server/users/service";
import { requireUser } from "@/server/session";

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

const ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;
/** «Не задана» приходит пустой строкой: у Select не бывает пустого значения, форма шлёт "" */
const jobFunctionSchema = z.enum(["MANAGER", "LOGIST", ""]).transform((value) => (value === "" ? null : value));

const createSchema = z.object({
  name: z.string().min(1, { error: "Укажите имя" }),
  email: z.email({ error: "Некорректный email" }),
  role: z.enum(ROLES),
  jobFunction: jobFunctionSchema,
  password: z.string().min(8, { error: "Временный пароль — минимум 8 символов" }),
});

async function run(action: () => Promise<unknown>, message?: string): Promise<AdminResult> {
  try {
    await action();
    revalidatePath("/admin/users");
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ForbiddenError || error instanceof Error) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
}

export async function createUserAction(input: z.input<typeof createSchema>): Promise<AdminResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => createUser(parsed.data), "Пользователь создан");
}

export async function renameUserAction(userId: string, name: string): Promise<AdminResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = z
    .string()
    .trim()
    .min(1, { error: "Укажите имя" })
    .max(100, { error: "Имя не длиннее 100 знаков" })
    .safeParse(name);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  return run(() => renameUser(userId, parsed.data), "Имя изменено");
}

export async function changeRoleAction(userId: string, role: string): Promise<AdminResult> {
  const actor = await requireUser(ADMIN_ROLES);
  const parsed = z.enum(ROLES).safeParse(role);
  if (!parsed.success) return { ok: false, error: "Неизвестная роль" };

  return run(() => changeUserRole(userId, parsed.data, actor.id), "Роль изменена");
}

export async function changeJobFunctionAction(userId: string, jobFunction: string): Promise<AdminResult> {
  await requireUser(ADMIN_ROLES);
  const parsed = jobFunctionSchema.safeParse(jobFunction);
  if (!parsed.success) return { ok: false, error: "Неизвестная функция" };

  return run(() => changeUserJobFunction(userId, parsed.data), "Функция изменена");
}

export async function setActiveAction(userId: string, isActive: boolean): Promise<AdminResult> {
  const actor = await requireUser(ADMIN_ROLES);
  return run(
    () => setUserActive(userId, isActive, actor.id),
    isActive ? "Сотрудник снова работает" : "Сотрудник отключён, сессии сброшены",
  );
}

export async function resetPasswordAction(userId: string, password: string): Promise<AdminResult> {
  await requireUser(ADMIN_ROLES);
  if (password.trim().length < 8) {
    return { ok: false, error: "Временный пароль — минимум 8 символов" };
  }
  return run(() => resetUserPassword(userId, password), "Пароль выдан, старые сессии сброшены");
}
