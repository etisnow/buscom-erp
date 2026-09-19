import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env, mailEnabled } from "@/server/env";

export type Letter = {
  to: string;
  subject: string;
  text: string;
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
    });
  }
  return transporter;
}

/**
 * Отправка письма. Без настроенного SMTP письмо не теряется молча:
 * оно печатается в лог сервера — так работает локальная разработка,
 * и так видно, что в бою почта не настроена.
 */
export async function sendLetter(letter: Letter): Promise<void> {
  if (!mailEnabled) {
    console.warn(
      `[mail] SMTP не настроен, письмо не отправлено.\n  Кому: ${letter.to}\n  Тема: ${letter.subject}\n${letter.text}`,
    );
    return;
  }

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
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
