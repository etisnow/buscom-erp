import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db";
import { env } from "@/server/env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Пользователей заводит администратор (PRD, M8) — самостоятельной регистрации нет.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "MANAGER", input: false },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
    },
  },
  plugins: [nextCookies()],
});
