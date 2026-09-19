import "server-only";
import { z } from "zod";

/** Переменные окружения сервера. Любая новая переменная — сюда и в .env.example. */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  /** Общий секрет для HMAC-подписи вебхуков сайта bus-com.ru */
  SITE_WEBHOOK_SECRET: z.string().min(32),
});

export const env = envSchema.parse(process.env);
