/**
 * Импорт истории переписки из общего ящика (решение владельца 2026-09-25):
 * письма за последние 3 года, только с клиентами, вложения — одними названиями.
 * Здесь — чистые правила: какие папки, какие письма, где в письме текст.
 */
import type { MailFolder } from "./folders";
import { normalizeEmailAddress } from "./letters";

export const HISTORY_YEARS = 3;

/** Папки, которые не импортируются: мусор и неотправленное. */
const SKIPPED_SPECIAL_USE = new Set(["\\Junk", "\\Trash", "\\Drafts"]);

export type HistoryFolder = { path: string; name: string; direction: "INBOUND" | "OUTBOUND"; messages: number };

/**
 * Папки для импорта по умолчанию: все, кроме спама, удалённых и черновиков.
 * «Отправленные» — это наши письма клиентам, остальное — входящие.
 */
export function defaultHistoryFolders(folders: MailFolder[]): HistoryFolder[] {
  // Вложенные папки пропускаемых тоже пропускаем: у «Черновики|template» своей метки нет
  const skipped = folders.filter((folder) => folder.specialUse && SKIPPED_SPECIAL_USE.has(folder.specialUse));
  const insideSkipped = (folder: MailFolder) =>
    skipped.some((parent) => folder.path === parent.path || folder.path.startsWith(parent.path + parent.delimiter));
  return folders
    .filter((folder) => folder.selectable && !insideSkipped(folder))
    .map((folder) => ({
      path: folder.path,
      name: folder.name,
      direction: folder.specialUse === "\\Sent" ? ("OUTBOUND" as const) : ("INBOUND" as const),
      messages: folder.messages ?? 0,
    }));
}

/** Начало периода импорта: ровно N лет назад от `now`. */
export function historySince(now: Date, years = HISTORY_YEARS): Date {
  const since = new Date(now);
  since.setUTCFullYear(since.getUTCFullYear() - years);
  return since;
}

type EnvelopeAddress = { name?: string; address?: string };

/** С кем письмо: у входящего — отправитель, у нашего — получатели (кому и копия). */
export function counterparts(
  direction: "INBOUND" | "OUTBOUND",
  envelope: { from?: EnvelopeAddress[]; to?: EnvelopeAddress[]; cc?: EnvelopeAddress[] },
): string[] {
  const list = direction === "INBOUND" ? (envelope.from ?? []) : [...(envelope.to ?? []), ...(envelope.cc ?? [])];
  return [...new Set(list.map((item) => normalizeEmailAddress(item.address)).filter((a): a is string => a !== null))];
}

/**
 * Письмо с клиентом — если собеседник есть среди адресов клиентов. Письмо самим
 * себе (копии, пересылки внутри ящика) — не переписка с клиентом.
 */
export function isClientLetter(addresses: string[], customerEmails: Set<string>, ownAddresses: Set<string>): boolean {
  return addresses.some((address) => customerEmails.has(address) && !ownAddresses.has(address));
}

type StructureNode = {
  part?: string;
  type: string;
  parameters?: Record<string, string>;
  disposition?: string;
  dispositionParameters?: Record<string, string>;
  size?: number;
  childNodes?: StructureNode[];
};

export type LetterParts = {
  /** Часть с текстом письма и её вид; нет — письмо без текста */
  text: { part: string; html: boolean } | null;
  attachments: { fileName: string; contentType: string; size: number }[];
};

/**
 * Где в письме текст и какие у него вложения — по BODYSTRUCTURE, не скачивая
 * письмо. Текст — первая text/plain не-вложение, иначе первая text/html.
 * Вложение — часть с disposition attachment или с именем файла; картинки внутри
 * HTML (inline с Content-ID) вложениями не считаем.
 */
export function letterParts(structure: StructureNode): LetterParts {
  const result: LetterParts = { text: null, attachments: [] };
  let html: string | null = null;

  const walk = (node: StructureNode) => {
    if (node.childNodes?.length) {
      node.childNodes.forEach(walk);
      return;
    }
    const type = node.type.toLowerCase();
    const fileName = node.dispositionParameters?.filename ?? node.parameters?.name;
    const isAttachment =
      node.disposition?.toLowerCase() === "attachment" || (fileName && node.disposition !== "inline");
    if (isAttachment) {
      result.attachments.push({ fileName: fileName ?? "вложение", contentType: type, size: node.size ?? 0 });
      return;
    }
    const part = node.part ?? "1";
    if (type === "text/plain" && !result.text) result.text = { part, html: false };
    else if (type === "text/html" && html === null) html = part;
  };
  walk(structure);

  if (!result.text && html !== null) result.text = { part: html, html: true };
  return result;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
};

/** HTML-письмо в текст: абзацы и переносы сохраняются, разметка, стили и скрипты — нет. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Значение заголовка из сырого блока заголовков, со склейкой перенесённых строк. */
export function headerValue(rawHeaders: string, name: string): string | null {
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, " ");
  const match = new RegExp(`^${name}:\\s*(.*)$`, "im").exec(unfolded);
  return match ? match[1].trim() : null;
}
