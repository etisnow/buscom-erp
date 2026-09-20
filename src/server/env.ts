import "server-only";
import { z } from "zod";

/** Переменные окружения сервера. Любая новая переменная — сюда и в .env.example. */
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  /** Общий секрет для HMAC-подписи вебхуков сайта bus-com.ru */
  SITE_WEBHOOK_SECRET: z.string().min(32),

  /**
   * SMTP для писем со ссылкой на сброс пароля. Не задан — письма не отправляются,
   * а ссылка пишется в лог сервера: так работает локальная разработка,
   * а в бою отсутствие настроек видно по предупреждению при старте.
   */
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  /** Адрес в поле «От кого» */
  SMTP_FROM: z.string().default("BusCom ERP <noreply@bus-com.ru>"),
});

export const env = envSchema.parse(process.env);

/** Настроена ли отправка почты. */
export const mailEnabled = Boolean(env.SMTP_HOST);
