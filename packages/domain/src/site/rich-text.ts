/**
 * Форматированный текст описания товара. В базе — простой текст, не HTML (docs/DECISIONS.md,
 * «Описание товара»): строка — один блок, слева маркер блока (`page-text.ts`: «## », «### »,
 * «> », «• », «1. »), внутри строки — встроенная разметка:
 *
 *   **жирный**   *курсив*   ***жирный курсив***   __подчёркнутый__   [текст ссылки](https://адрес)
 *   \* \\ \[ \] \_\_  — знак как обычный символ
 *
 * Здесь — разбор и сборка этой разметки и перевод между текстом и блоками редактора. Сайт выводит
 * разметку сам (React-элементами, без `dangerouslySetInnerHTML`), поэтому санитайзер не нужен:
 * ссылкой становится только адрес http/https.
 */
import { parsePageText } from "./page-text";

export type Span = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; href?: string };

export type RichBlock =
  | { type: "paragraph" | "heading" | "subheading" | "quote"; spans: Span[] }
  | { type: "bulletList" | "orderedList"; items: Span[][] };

type Marks = { bold?: boolean; italic?: boolean; underline?: boolean; href?: string };

const ESCAPABLE = /[\\*_[\]]/;
/** `[подпись](адрес)`: подпись может содержать экранированные знаки, адрес — только http/https без пробелов и скобок */
const LINK = /^\[((?:\\.|[^\]\\])*)\]\((https?:\/\/[^\s()]+)\)/i;
const WORD_CHAR = /[\p{L}\p{N}]/u;
const SPACE = /\s/;

function sameMarks(a: Marks, b: Marks): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    Boolean(a.underline) === Boolean(b.underline) &&
    a.href === b.href
  );
}

/**
 * Где закрывается выделение, открытое на `from - run`. Внутри могут быть свои выделения и экранирование.
 * Не закрывает посреди слова и на пробеле, чтобы «5*3*2» и «2 * 3 * 4» оставались обычным текстом.
 */
function findClose(text: string, from: number, run: number, char = "*"): number {
  if (from >= text.length || SPACE.test(text[from])) return -1;
  const mark = char.repeat(run);
  for (let j = from; j < text.length; j++) {
    if (text[j] === "\\") {
      j++;
      continue;
    }
    if (text[j] !== char) continue;
    if (char === "*" && run === 1 && text[j + 1] === "*") {
      // «**» внутри курсива — жирный внутри, а не конец курсива
      j++;
      continue;
    }
    if (!text.startsWith(mark, j) || j === from) continue;
    if (SPACE.test(text[j - 1])) continue;
    const next = text[j + run];
    if (next !== undefined && WORD_CHAR.test(next)) continue;
    return j;
  }
  return -1;
}

/** Разбор одной строки: куски текста с отметками. Соседние куски с одинаковыми отметками склеены. */
export function parseInline(input: string): Span[] {
  const spans: Span[] = [];
  const push = (text: string, marks: Marks) => {
    if (!text) return;
    const last = spans.at(-1);
    if (last && sameMarks(last, marks)) {
      last.text += text;
      return;
    }
    const span: Span = { text };
    if (marks.bold) span.bold = true;
    if (marks.italic) span.italic = true;
    if (marks.underline) span.underline = true;
    if (marks.href) span.href = marks.href;
    spans.push(span);
  };

  const walk = (text: string, marks: Marks) => {
    let buffer = "";
    const flush = () => {
      push(buffer, marks);
      buffer = "";
    };
    let i = 0;
    while (i < text.length) {
      const char = text[i];
      if (char === "\\" && i + 1 < text.length && ESCAPABLE.test(text[i + 1])) {
        buffer += text[i + 1];
        i += 2;
        continue;
      }
      if (char === "[" && !marks.href) {
        const link = LINK.exec(text.slice(i));
        if (link) {
          flush();
          walk(link[1], { ...marks, href: link[2] });
          i += link[0].length;
          continue;
        }
      }
      if (char === "*" && !(i > 0 && WORD_CHAR.test(text[i - 1]))) {
        const run = text.startsWith("***", i) ? 3 : text.startsWith("**", i) ? 2 : 1;
        const close = findClose(text, i + run, run);
        if (close !== -1) {
          flush();
          const inner: Marks = { ...marks };
          if (run >= 2) inner.bold = true;
          if (run !== 2) inner.italic = true;
          walk(text.slice(i + run, close), inner);
          i = close + run;
          continue;
        }
      }
      // «__текст__» — подчёркивание; «___» и подчёркивания внутри слова (S09_1) обычным текстом
      if (char === "_" && text.startsWith("__", i) && text[i + 2] !== "_" && !(i > 0 && WORD_CHAR.test(text[i - 1]))) {
        const close = findClose(text, i + 2, 2, "_");
        if (close !== -1) {
          flush();
          walk(text.slice(i + 2, close), { ...marks, underline: true });
          i = close + 2;
          continue;
        }
      }
      buffer += char;
      i++;
    }
    flush();
  };

  walk(input, {});
  return spans;
}

/** Экранируются знаки разметки; одиночное «_» (S09_1) остаётся как есть, пара «__» — нет. */
const escapeText = (text: string) => text.replace(/[\\*[\]]/g, "\\$&").replace(/__/g, "\\_\\_");

/** Адрес для разметки: только http/https, пробелы и скобки закодированы. Иначе null — ссылки не будет. */
function safeHref(href: string | undefined): string | null {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  return href.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29");
}

function serializeSpan(span: Span): string {
  const lead = /^\s*/.exec(span.text)?.[0] ?? "";
  const core = span.text.trim();
  // Пробелы по краям выделения выносим наружу: «** текст**» уже не выделение
  if (!core) return span.text;
  let out = escapeText(core);
  if (span.bold && span.italic) out = `***${out}***`;
  else if (span.bold) out = `**${out}**`;
  else if (span.italic) out = `*${out}*`;
  if (span.underline) out = `__${out}__`;
  const href = safeHref(span.href);
  if (href) out = `[${out}](${href})`;
  return lead + out + span.text.slice(lead.length + core.length);
}

/** Обратное к `parseInline`. Соседние куски с одинаковыми отметками склеиваются: «**а****б**» не получится. */
export function serializeInline(spans: readonly Span[]): string {
  const merged: Span[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const last = merged.at(-1);
    if (last && sameMarks(last, span)) merged[merged.length - 1] = { ...last, text: last.text + span.text };
    else merged.push({ ...span });
  }
  return merged.map(serializeSpan).join("");
}

/** Текст без встроенной разметки — для выгрузки, описания в поиске, подсказок совместимости. Маркеры блоков остаются. */
export function stripInline(text: string): string {
  return text
    .split("\n")
    .map((line) =>
      parseInline(line)
        .map((span) => span.text)
        .join(""),
    )
    .join("\n");
}

/** Текст → блоки редактора. Пустые строки пропускаются; «? вопрос» и ответ превращаются в обычные абзацы. */
export function markupToBlocks(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const block of parsePageText(text)) {
    switch (block.kind) {
      case "heading":
        blocks.push({ type: "heading", spans: parseInline(block.text) });
        break;
      case "subheading":
        blocks.push({ type: "subheading", spans: parseInline(block.text) });
        break;
      case "quote":
        blocks.push({ type: "quote", spans: parseInline(block.text) });
        break;
      case "paragraph":
        blocks.push({ type: "paragraph", spans: parseInline(block.text) });
        break;
      case "list":
        blocks.push({
          type: block.ordered ? "orderedList" : "bulletList",
          items: block.items.map((item) => parseInline(item)),
        });
        break;
      case "faq":
        for (const item of block.items) {
          blocks.push({ type: "paragraph", spans: parseInline(`? ${item.question}`) });
          if (item.answer) blocks.push({ type: "paragraph", spans: parseInline(item.answer) });
        }
        break;
    }
  }
  return blocks;
}

const isEmpty = (spans: readonly Span[]) => spans.every((span) => !span.text.trim());

/** Блоки редактора → текст. Пустые абзацы и пункты отбрасываются: на сайте их всё равно не видно. */
export function blocksToMarkup(blocks: readonly RichBlock[]): string {
  const lines: string[] = [];
  for (const block of blocks) {
    if ("items" in block) {
      let number = 0;
      for (const item of block.items) {
        if (isEmpty(item)) continue;
        number += 1;
        lines.push(`${block.type === "bulletList" ? "•" : `${number}.`} ${serializeInline(item)}`);
      }
      continue;
    }
    if (isEmpty(block.spans)) continue;
    const line = serializeInline(block.spans);
    lines.push(
      block.type === "heading"
        ? `## ${line}`
        : block.type === "subheading"
          ? `### ${line}`
          : block.type === "quote"
            ? `> ${line}`
            : line,
    );
  }
  return lines.join("\n");
}
