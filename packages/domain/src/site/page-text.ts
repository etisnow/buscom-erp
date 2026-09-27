/**
 * Текст страниц сайта, который правят в ERP (docs/SITE-PLAN.md, этап 6). В базе —
 * простой текст, не HTML (как описание товара, docs/DECISIONS.md, «Описание товара»):
 * менеджер пишет его в обычном поле, а вёрстка остаётся за сайтом.
 *
 *   ## Заголовок раздела
 *   Абзац — любая строка.
 *   • пункт списка (или «- пункт»)
 *   1. пункт нумерованного списка
 *   ? Вопрос для блока «Частые вопросы»
 *   ответ — строки под вопросом до пустой строки
 *
 * Строки подряд одного вида собираются в один список; пустая строка их разделяет.
 */

export type PageBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "faq"; items: { question: string; answer: string }[] };

const BULLET = /^[•-]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

export function parsePageText(text: string): PageBlock[] {
  const blocks: PageBlock[] = [];
  /** Внутри ответа на вопрос: строки дописываются к нему до пустой строки */
  let answering = false;

  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    const last = blocks.at(-1);
    if (!line) {
      answering = false;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push({ kind: "heading", text: line.slice(3).trim() });
      answering = false;
    } else if (line.startsWith("? ")) {
      const item = { question: line.slice(2).trim(), answer: "" };
      if (last?.kind === "faq") last.items.push(item);
      else blocks.push({ kind: "faq", items: [item] });
      answering = true;
    } else if (answering && last?.kind === "faq") {
      const item = last.items[last.items.length - 1];
      item.answer = item.answer ? `${item.answer} ${line}` : line;
    } else if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line);
      const item = line.replace(ordered ? NUMBERED : BULLET, "");
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }
  return blocks;
}

/** Вопросы и ответы страницы — для разметки FAQPage. Вопрос без ответа не попадает. */
export function pageFaq(blocks: readonly PageBlock[]): { question: string; answer: string }[] {
  return blocks.flatMap((block) => (block.kind === "faq" ? block.items.filter((item) => item.answer) : []));
}
