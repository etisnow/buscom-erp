import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { smtpConfigured, type SmtpSettings } from "@buscom/domain/settings";
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

/**
 * Таймауты обязательны: при несовпадении порта и шифрования (465 без TLS или
 * 587 с ним) соединение не отвергается, а молча висит. Без них запрос на смену
 * пароля завис бы вместе с ним.
 */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };

function buildTransport(smtp: SmtpSettings): Transporter {
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.password } } : {}),
    ...TIMEOUTS,
  });
}

let cached: { key: string; transporter: Transporter } | null = null;

/**
 * Соединение переиспользуется, но ключом служат сами настройки: после правки
 * в интерфейсе письмо должно уйти уже через новый сервер, без перезапуска.
 */
function getTransporter(smtp: SmtpSettings): Transporter {
  const key = JSON.stringify(smtp);
  if (cached?.key !== key) {
    cached = { key, transporter: buildTransport(smtp) };
  }
  return cached.transporter;
}

/** Настроена ли почта — в интерфейсе или в окружении. Без неё `sendLetter` только пишет в лог. */
export async function mailConfigured(): Promise<boolean> {
  return (await resolveSmtp()) !== null;
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

/**
 * Проверочная отправка заданными настройками — в том числе ещё не сохранёнными.
 * Соединение разовое и не попадает в кеш: проверяют часто и заведомо неверное,
 * и такая попытка не должна влиять на настоящую отправку писем.
 *
 * Ошибку не глушит: вызывающий показывает её администратору.
 */
export async function sendTestLetter(smtp: SmtpSettings, to: string): Promise<void> {
  const transporter = buildTransport(smtp);
  try {
    await transporter.sendMail({
      from: smtp.from || env.SMTP_FROM,
      to,
      subject: "BusCom ERP: проверка почты",
      text: [
        "Это проверочное письмо из BusCom ERP.",
        "",
        `Сервер: ${smtp.host}:${smtp.port}, шифрование: ${smtp.secure ? "TLS сразу" : "STARTTLS"}.`,
        "",
        "Раз письмо дошло, ссылки на смену пароля сотрудникам тоже будут доходить.",
      ].join("\n"),
    });
  } finally {
    transporter.close();
  }
}

/** Проверка адреса уведомлений из личных настроек. */
export function testNotificationLetter(to: string, name: string): Letter {
  return {
    to,
    subject: "BusCom ERP: тестовое уведомление",
    text: [
      `${name}, это тестовое письмо из личных настроек BusCom ERP.`,
      "",
      "Раз оно дошло, уведомления о заказах будут приходить на этот адрес.",
      "Если письмо попало в спам, отметьте его как «не спам».",
    ].join("\n"),
  };
}

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Почта не настроена: заполните «Администрирование → Настройки почты» — без этого письмо клиенту не уйдёт");
    this.name = "MailNotConfiguredError";
  }
}

export type ClientLetter = {
  to: string[];
  subject: string;
  text: string;
  /** Наш Message-ID без скобок — по нему потом узнаём ответ клиента */
  messageId: string;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: { fileName: string; contentType: string; content: Buffer }[];
};

/** Адрес «От кого» для писем клиенту — тот же, что у остальных писем. */
export async function senderAddress(): Promise<string | null> {
  const smtp = await resolveSmtp();
  return smtp ? smtp.from || env.SMTP_FROM : null;
}

/**
 * Письмо клиенту. В отличие от `sendLetter`, без настроенной почты не пишет в лог,
 * а бросает ошибку: человек нажал «Отправить» и должен узнать, что письмо не ушло.
 * Ошибку SMTP тоже не глушит — её показывают в форме.
 *
 * Письмо сначала собирается целиком и уходит готовым текстом: этот же текст
 * кладётся копией в «Отправленные» ящика — с тем же Message-ID, что в базе, так
 * опрос «Отправленных» узнает его и не заведёт второй раз. Возвращает текст письма.
 */
export async function sendClientLetter(letter: ClientLetter): Promise<Buffer> {
  const smtp = await resolveSmtp();
  if (!smtp) throw new MailNotConfiguredError();

  const { source, envelope } = await buildClientLetter(smtp.from || env.SMTP_FROM, letter);
  await getTransporter(smtp).sendMail({ envelope, raw: source });
  return source;
}

/** Письмо в виде текста MIME и конверт с голыми адресами — без отправки. */
async function buildClientLetter(
  from: string,
  letter: ClientLetter,
): Promise<{ source: Buffer; envelope: { from: string; to: string[] } }> {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: "windows" });
  const info = await composer.sendMail({
    from,
    to: letter.to,
    subject: letter.subject,
    text: letter.text,
    messageId: `<${letter.messageId}>`,
    ...(letter.inReplyTo ? { inReplyTo: `<${letter.inReplyTo}>` } : {}),
    ...(letter.references?.length ? { references: letter.references.map((id) => `<${id}>`) } : {}),
    attachments: letter.attachments?.map((file) => ({
      filename: file.fileName,
      contentType: file.contentType,
      content: file.content,
    })),
  });
  const envelope = info.envelope as { from: string | false; to: string[] };
  return { source: info.message as Buffer, envelope: { from: envelope.from || from, to: envelope.to } };
}
