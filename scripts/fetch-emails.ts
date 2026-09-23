/**
 * Скачать письма из ящика заказов в .eml — образцы для парсера писем с сайта.
 *
 *   pnpm fetch:emails                 # последние 20 писем из INBOX → misc/emails/
 *   pnpm fetch:emails 50              # последние 50
 *
 * Ящик — из переменных IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASSWORD (`.env`).
 * Письма читаются через BODY.PEEK: отметка «прочитано» не ставится, ящик не меняется.
 * `misc/` в .gitignore — в письмах персональные данные клиентов.
 *
 * Если хостинг не открывается из этой сети (VPN), идём через боевой сервер:
 *
 *   ssh -N -L 1993:mail.jino.ru:993 buscom-prod
 *   IMAP_VIA=127.0.0.1:1993 pnpm fetch:emails
 *
 * Сертификат при этом по-прежнему проверяется по имени из IMAP_HOST.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ImapFlow } from "imapflow";

const OUT_DIR = "misc/emails";
const limit = Number(process.argv[2] ?? 20);

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная ${name} — см. .env.example`);
  return value;
}

/** Что прочиталось из .env — без самого пароля: частая причина отказа — кавычки, пробелы, обрезка по `#`. */
function describeCredentials(user: string, pass: string): string {
  const hints: string[] = [];
  if (pass !== pass.trim()) hints.push("пробелы по краям");
  if (/^["']|["']$/.test(pass)) hints.push("кавычки по краям");
  return `логин «${user}», пароль ${pass.length} симв.${hints.length ? ` (${hints.join(", ")})` : ""}`;
}

async function main() {
  const host = required("IMAP_HOST");
  const user = required("IMAP_USER");
  const pass = required("IMAP_PASSWORD");
  const [viaHost, viaPort] = (process.env.IMAP_VIA ?? "").split(":");
  console.log(`Вход: ${describeCredentials(user, pass)}`);

  // Сначала AUTHENTICATE PLAIN (выбор imapflow), при отказе — команда LOGIN: часть серверов принимает только её
  const connect = async (loginMethod?: string) => {
    const client = new ImapFlow({
      host: viaHost || host,
      port: Number(viaPort || process.env.IMAP_PORT || 993),
      secure: true,
      tls: { servername: host },
      auth: { user, pass, loginMethod },
      logger: false,
    });
    await client.connect();
    return client;
  };

  let client: ImapFlow;
  try {
    client = await connect();
  } catch (error) {
    if (!(error as { authenticationFailed?: boolean }).authenticationFailed) throw error;
    console.log("AUTHENTICATE PLAIN не принят, пробую LOGIN");
    client = await connect("LOGIN");
  }

  const lock = await client.getMailboxLock("INBOX");
  try {
    const mailbox = client.mailbox;
    const total = mailbox ? mailbox.exists : 0;
    console.log(`В INBOX писем: ${total}`);
    if (total === 0) return;

    mkdirSync(OUT_DIR, { recursive: true });
    const from = Math.max(1, total - limit + 1);
    for await (const message of client.fetch(`${from}:*`, { uid: true, envelope: true, source: true })) {
      if (!message.source) continue;
      const file = join(OUT_DIR, `${message.uid}.eml`);
      writeFileSync(file, message.source);
      const date = message.envelope?.date ? new Date(message.envelope.date).toISOString() : "";
      console.log(`${file}  ${date}  ${message.envelope?.subject ?? ""}`);
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

main().catch((error) => {
  // У imapflow message общий («Command failed»), суть — в ответе сервера
  const details = error as { authenticationFailed?: boolean; responseText?: string; serverResponseCode?: string };
  console.error(error instanceof Error ? error.message : error);
  if (details.authenticationFailed) console.error("Сервер не принял логин или пароль (IMAP_USER / IMAP_PASSWORD)");
  if (details.serverResponseCode) console.error(`Код сервера: ${details.serverResponseCode}`);
  if (details.responseText) console.error(`Ответ сервера: ${details.responseText}`);
  process.exit(1);
});
