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
  // PRD, M8: подбор пароля ограничен. Счётчик в памяти процесса — для одного инстанса
  // внутренней админки достаточно; при нескольких инстансах нужен общий storage.
  rateLimit: {
    enabled: true,
    storage: "memory",
    customRules: {
      "/sign-in/email": { window: 15 * 60, max: 10 },
      "/forget-password": { window: 15 * 60, max: 5 },
    },
  },
  plugins: [nextCookies()],
});
