import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { smtpConfigured, type SmtpSettings } from "@/domain/settings";
import { env } from "@/server/env";
import { readSettings } from "@/server/settings/service";

export type Letter = {
  to: string;
  subject: string;
  text: string;
};

/**
 * Откуда берутся настройки почты: сначала то, что администратор ввёл в
 * `/admin/dictionaries`, потом переменные окружения. Порядок именно такой —
 * введённое руками должно побеждать, иначе настройка через интерфейс ничего
 * не меняла бы на сервере, где `.env.production` заполнен.
 *
 * `readSettings`, а не `getSettings`: письмо уходит из обработчика Better Auth,
 * вне контекста рендера, где `cache` из React неприменим.
 */
async function resolveSmtp(): Promise<SmtpSettings | null> {
  const settings = await readSettings();
  if (smtpConfigured(settings.smtp)) return settings.smtp;

  if (env.SMTP_HOST) {
    return {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: env.SMTP_USER ?? "",
      password: env.SMTP_PASSWORD ?? "",
      from: env.SMTP_FROM,
    };
  }

  return null;
}

let cached: { key: string; transporter: Transporter } | null = null;

/**
 * Соединение переиспользуется, но ключом служат сами настройки: после правки
 * в интерфейсе письмо должно уйти уже через новый сервер, без перезапуска.
 */
function getTransporter(smtp: SmtpSettings): Transporter {
  const key = JSON.stringify(smtp);
  if (cached?.key !== key) {
    cached = {
      key,
      transporter: nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
      }),
    };
  }
  return cached.transporter;
}

/**
 * Отправка письма. Без настроенного SMTP письмо не теряется молча:
 * оно печатается в лог сервера — так работает локальная разработка,
 * и так видно, что в бою почта не настроена.
 */
export async function sendLetter(letter: Letter): Promise<void> {
  const smtp = await resolveSmtp();

  if (!smtp) {
    console.warn(
      `[mail] SMTP не настроен, письмо не отправлено.\n  Кому: ${letter.to}\n  Тема: ${letter.subject}\n${letter.text}`,
    );
    return;
  }

  await getTransporter(smtp).sendMail({
    // Поле «От кого» необязательное в настройках: пустое — берём из окружения
    from: smtp.from || env.SMTP_FROM,
    to: letter.to,
    subject: letter.subject,
    text: letter.text,
  });
}

export function passwordResetLetter(to: string, url: string): Letter {
  return {
    to,
    subject: "BusCom ERP: восстановление пароля",
    text: [
      "Вы запросили смену пароля в BusCom ERP.",
      "",
      `Ссылка для смены пароля: ${url}`,
      "",
      "Ссылка действует один час. Если вы не запрашивали смену пароля, просто не открывайте её.",
    ].join("\n"),
  };
}
