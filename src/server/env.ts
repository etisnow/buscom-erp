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
   * SMTP — запасной путь: основной — настройки в `/admin/dictionaries`, и они главнее
   * (`src/server/mail.ts`). Ни там, ни здесь не задан — письма не отправляются,
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

  /**
   * Ключ API DaData (dadata.ru → личный кабинет → «API-ключ») — для кнопки
   * «Заполнить» по ИНН в карточке клиента. Секретный ключ не нужен. Не задан —
   * кнопка честно говорит, что поиск не настроен; остальное работает.
   */
  DADATA_API_KEY: z.string().min(1).optional(),

  /**
   * Ящик, куда сайт шлёт письма о заказах (`src/server/integrations/mailbox.ts`).
   * IMAP по SSL. Не задан хост — почта не опрашивается, остальное работает.
   */
  IMAP_HOST: z.string().min(1).optional(),
  IMAP_PORT: z.coerce.number().int().positive().default(993),
  IMAP_USER: z.string().optional(),
  IMAP_PASSWORD: z.string().optional(),
  /**
   * Как часто проверять ящик, секунд. По умолчанию — раз в 2 минуты в бою и
   * никогда в разработке: базу разработки делят две машины, и опрос с обеих
   * сразу ни к чему. В разработке ящик проверяют кнопкой в журнале интеграции
   * или `pnpm mail:poll`. 0 — выключить.
   */
  IMAP_POLL_SECONDS: z.coerce.number().int().min(0).optional(),
  /**
   * Только для разработки: подключаться не к IMAP_HOST, а к `хост:порт` SSH-проброса
   * (`ssh -N -L 1993:mail.jino.ru:993 buscom-prod`), если хостинг почты не открывается
   * из этой сети. Сертификат по-прежнему проверяется по имени IMAP_HOST.
   */
  IMAP_VIA: z
    .string()
    .regex(/^[^:]+:\d+$/, { error: "IMAP_VIA — в виде хост:порт" })
    .optional(),

  /**
   * Учётная запись первого администратора — её заводит сид (`prisma/seed.ts`).
   * Приложению она нужна только в разработке: форма входа подставляет её сама,
   * чтобы не набирать пароль при каждом перезапуске. В бою эти переменные
   * получает лишь контейнер миграций (`docker-compose.prod.yml`), до `app`
   * они не доходят — поэтому здесь они необязательные.
   */
  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
});

type RawEnv = Record<string, string | undefined>;

/**
 * Пустая строка означает «не задано», а не «задано пустым».
 * Так пишут в `.env` и так передаёт Docker Compose незаполненную переменную:
 * `SMTP_HOST: ${SMTP_HOST:-}` доходит до процесса как "". Без этой очистки
 * `.optional()` не спасает — он допускает `undefined`, но не "", и приложение
 * падало на старте в бою, хотя локально та же конфигурация работала.
 */
function withoutEmpty(raw: RawEnv): RawEnv {
  return Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== ""));
}

export function parseEnv(raw: RawEnv = process.env): z.infer<typeof envSchema> {
  return envSchema.parse(withoutEmpty(raw));
}

export const env = parseEnv();

/**
 * Учётные данные, которыми форма входа заполняется сама при `pnpm dev`.
 *
 * В продакшене — всегда `null`, и решает это `NODE_ENV`, а не наличие
 * переменных: пароль уходит в разметку страницы входа, то есть показывается
 * любому, кто её открыл. Полагаться на то, что в бою переменных «и так нет»,
 * для такого нельзя — нужна проверка, которую не отменить настройкой.
 */
export function pickDevLoginCredentials(
  parsed: Pick<z.infer<typeof envSchema>, "SEED_ADMIN_EMAIL" | "SEED_ADMIN_PASSWORD">,
  nodeEnv: string | undefined,
): DevLoginCredentials | null {
  if (nodeEnv === "production") return null;
  if (!parsed.SEED_ADMIN_EMAIL || !parsed.SEED_ADMIN_PASSWORD) return null;
  return { email: parsed.SEED_ADMIN_EMAIL, password: parsed.SEED_ADMIN_PASSWORD };
}

export const devLoginCredentials = pickDevLoginCredentials(env, process.env.NODE_ENV);

export type DevLoginCredentials = { email: string; password: string };
