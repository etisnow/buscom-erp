"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signInWithPassword, signOutCurrentSession } from "@/server/auth-service";

const signInSchema = z.object({
  email: z.email({ error: "Введите корректный email" }),
  password: z.string().min(1, { error: "Введите пароль" }),
});

export type SignInState = {
  error?: string;
  /** Введённый email возвращаем в форму, чтобы её не приходилось заполнять заново. */
  email?: string;
};

const DEFAULT_REDIRECT = "/orders";

/** Возвращаем только на свой же относительный путь — чужой адрес в `next` игнорируем. */
function safeRedirect(next: FormDataEntryValue | null): string {
  if (typeof next !== "string") return DEFAULT_REDIRECT;
  if (!next.startsWith("/") || next.startsWith("//")) return DEFAULT_REDIRECT;
  return next;
}

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const parsed = signInSchema.safeParse({ email, password: formData.get("password") });

  if (!parsed.success) {
    return { error: z.prettifyError(parsed.error), email };
  }

  const result = await signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    headers: await headers(),
  });

  if (!result.ok) {
    return { error: result.message, email };
  }

  redirect(safeRedirect(formData.get("next")));
}

export async function signOutAction(): Promise<void> {
  await signOutCurrentSession(await headers());
  redirect("/login");
}
