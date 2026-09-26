"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth";

export type ForgotState = { sent?: boolean; error?: string; email?: string };

const schema = z.object({ email: z.email({ error: "Введите корректный email" }) });

/**
 * Запрос ссылки на смену пароля. Ответ одинаков и для существующего, и для
 * несуществующего адреса — по нему нельзя перебрать список сотрудников.
 */
export async function requestResetAction(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "");
  const parsed = schema.safeParse({ email });
  if (!parsed.success) return { error: z.prettifyError(parsed.error), email };

  try {
    await auth.api.requestPasswordReset({
      body: { email: parsed.data.email, redirectTo: "/reset-password" },
      headers: await headers(),
    });
  } catch {
    // Даже при ошибке отправки не раскрываем, существует ли такой адрес.
  }

  return { sent: true, email };
}

const resetSchema = z
  .object({
    token: z.string().min(1, { error: "Ссылка недействительна" }),
    password: z.string().min(8, { error: "Пароль — минимум 8 символов" }),
    confirm: z.string(),
  })
  .refine((data) => data.password === data.confirm, { error: "Пароли не совпадают", path: ["confirm"] });

export type ResetState = { done?: boolean; error?: string };

export async function resetPasswordAction(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { error: z.prettifyError(parsed.error) };

  try {
    await auth.api.resetPassword({
      body: { newPassword: parsed.data.password, token: parsed.data.token },
      headers: await headers(),
    });
  } catch {
    return { error: "Ссылка недействительна или истекла. Запросите новую." };
  }

  return { done: true };
}
