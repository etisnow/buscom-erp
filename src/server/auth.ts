import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { passwordResetLetter, sendLetter } from "@/server/mail";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Пользователей заводит администратор (PRD, M8) — самостоятельной регистрации нет.
    disableSignUp: true,
    minPasswordLength: 8,
    // Ссылка живёт час: PRD требует восстановление по почте, а не звонок администратору.
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url }) => {
      await sendLetter(passwordResetLetter(user.email, url));
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "MANAGER", input: false },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  // Защита от флуда: лимит запросов с одного адреса. Правило PRD «10 неудачных
  // попыток за 15 минут» считается отдельно и по email — в БД, см.
  // src/server/auth/login-attempts.ts. Здесь порог заведомо выше, чтобы он не
  // срабатывал раньше и не блокировал соседа по NAT из-за чужих опечаток.
  // Хранилище — память процесса: инстанс один, при нескольких нужен общий storage.
  rateLimit: {
    enabled: true,
    storage: "memory",
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 60 },
      "/forget-password": { window: 15 * 60, max: 5 },
    },
  },
  plugins: [nextCookies()],
});
