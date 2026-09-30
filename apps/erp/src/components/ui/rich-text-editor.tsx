"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Underline,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { blocksToMarkup, markupToBlocks, type RichBlock, type Span } from "@buscom/domain/site/rich-text";
import { cn } from "@/lib/utils";

/* ── Текст ⇄ документ редактора ──────────────────────────────────────────────────────────────
 * В базе — простой текст с разметкой (packages/domain/src/site/rich-text.ts), не HTML. Редактор
 * работает с документом ProseMirror, а на границе документ переводится в блоки и обратно. */

function spansToNodes(spans: readonly Span[]): JSONContent[] {
  return spans
    .filter((span) => span.text)
    .map((span) => {
      const marks: NonNullable<JSONContent["marks"]> = [];
      if (span.bold) marks.push({ type: "bold" });
      if (span.italic) marks.push({ type: "italic" });
      if (span.underline) marks.push({ type: "underline" });
      if (span.href) marks.push({ type: "link", attrs: { href: span.href } });
      return { type: "text", text: span.text, ...(marks.length ? { marks } : {}) };
    });
}

const paragraph = (spans: readonly Span[]): JSONContent => {
  const content = spansToNodes(spans);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
};

function blockToNode(block: RichBlock): JSONContent {
  switch (block.type) {
    case "paragraph":
      return paragraph(block.spans);
    case "heading":
    case "subheading":
      return {
        type: "heading",
        attrs: { level: block.type === "heading" ? 2 : 3 },
        content: spansToNodes(block.spans),
      };
    case "quote":
      return { type: "blockquote", content: [paragraph(block.spans)] };
    case "bulletList":
    case "orderedList":
      return {
        type: block.type,
        content: block.items.map((item) => ({ type: "listItem", content: [paragraph(item)] })),
      };
  }
}

function markupToDoc(markup: string): JSONContent {
  const blocks = markupToBlocks(markup);
  return { type: "doc", content: blocks.length ? blocks.map(blockToNode) : [{ type: "paragraph" }] };
}

/** Куски текста абзаца или заголовка с отметками. */
function nodeSpans(node: JSONContent): Span[] {
  const spans: Span[] = [];
  for (const child of node.content ?? []) {
    if (child.type === "text" && child.text) {
      const span: Span = { text: child.text };
      for (const mark of child.marks ?? []) {
        if (mark.type === "bold") span.bold = true;
        if (mark.type === "italic") span.italic = true;
        if (mark.type === "underline") span.underline = true;
        if (mark.type === "link" && typeof mark.attrs?.href === "string") span.href = mark.attrs.href;
      }
      spans.push(span);
    } else if (child.type === "hardBreak") {
      spans.push({ text: " " });
    }
  }
  return spans;
}

/** Пункты списка; вложенные списки выравниваются в один уровень — формат вложенности не знает. */
function listItems(list: JSONContent): Span[][] {
  const items: Span[][] = [];
  for (const item of list.content ?? []) {
    for (const child of item.content ?? []) {
      if (child.type === "bulletList" || child.type === "orderedList") items.push(...listItems(child));
      else items.push(nodeSpans(child));
    }
  }
  return items;
}

function nodeToBlocks(node: JSONContent): RichBlock[] {
  switch (node.type) {
    case "paragraph":
      return [{ type: "paragraph", spans: nodeSpans(node) }];
    case "heading":
      return [{ type: Number(node.attrs?.level) >= 3 ? "subheading" : "heading", spans: nodeSpans(node) }];
    case "blockquote":
      return (node.content ?? []).flatMap((child) =>
        child.type === "paragraph" ? [{ type: "quote" as const, spans: nodeSpans(child) }] : nodeToBlocks(child),
      );
    case "bulletList":
    case "orderedList":
      return [{ type: node.type, items: listItems(node) }];
    default:
      return [{ type: "paragraph", spans: nodeSpans(node) }];
  }
}

function docToMarkup(doc: JSONContent): string {
  return blocksToMarkup((doc.content ?? []).flatMap(nodeToBlocks));
}

/* ── Редактор ────────────────────────────────────────────────────────────────────────────── */

/** Строгая проверка адреса: только http/https. Без схемы дописываем https://. */
function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  return /^https?:\/\/[^\s]+$/i.test(url) ? url : null;
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // mousedown не должен отнимать фокус у текста: иначе выделение потеряется до применения кнопки
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const IDLE_TOOLBAR = {
  h2: false,
  h3: false,
  bold: false,
  italic: false,
  underline: false,
  link: false,
  bullet: false,
  ordered: false,
  quote: false,
  canUndo: false,
  canRedo: false,
};

const CONTENT_CLASS = [
  "min-h-40 max-h-96 overflow-y-auto rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "[&_p]:my-1.5 [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:font-semibold",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li_p]:my-0.5",
  "[&_blockquote]:my-1.5 [&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:italic",
  "[&_a]:text-primary [&_a]:underline [&_strong]:font-semibold",
].join(" ");

/**
 * Редактор описания товара: текст правится сразу в том виде, в каком его увидит покупатель, а кнопки
 * над ним ставят форматирование — заголовки, жирный, курсив, ссылки, списки, цитаты. В базе остаётся
 * простой текст с разметкой (`rich-text.ts`), поэтому выгрузка, счета и сайт работают как прежде.
 * Движок — TipTap (ProseMirror): он держит выделение, отмену и вставку, за нами — только формат.
 */
export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  /** Что редактор сам отдал наружу: если `value` иной — текст заменили снаружи (импорт), и документ надо перечитать */
  const emitted = useRef(value);
  const [linkBar, setLinkBar] = useState<{ url: string; error: boolean } | null>(null);

  const editor = useEditor({
    // Страница рисуется и на сервере; редактор поднимается уже в браузере
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        // Формат знает только: заголовки, абзацы, списки, цитату, жирный, курсив, ссылку
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        hardBreak: false,
        trailingNode: false,
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          isAllowedUri: (url: string) => /^https?:\/\//i.test(url),
        },
      }),
    ],
    content: markupToDoc(value),
    editorProps: { attributes: { id, class: cn(CONTENT_CLASS, className) } },
    onUpdate: ({ editor: current }) => {
      const markup = docToMarkup(current.getJSON());
      emitted.current = markup;
      onChange(markup);
    },
  });

  useEffect(() => {
    if (!editor || value === emitted.current) return;
    emitted.current = value;
    editor.commands.setContent(markupToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  const toolbar = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      h2: current?.isActive("heading", { level: 2 }) ?? false,
      h3: current?.isActive("heading", { level: 3 }) ?? false,
      bold: current?.isActive("bold") ?? false,
      italic: current?.isActive("italic") ?? false,
      underline: current?.isActive("underline") ?? false,
      link: current?.isActive("link") ?? false,
      bullet: current?.isActive("bulletList") ?? false,
      ordered: current?.isActive("orderedList") ?? false,
      quote: current?.isActive("blockquote") ?? false,
      canUndo: current?.can().undo() ?? false,
      canRedo: current?.can().redo() ?? false,
    }),
  });

  // Пока редактор поднимается, состояния нет — все кнопки «выключены»
  const state = toolbar ?? IDLE_TOOLBAR;

  if (!editor) return <div className={cn(CONTENT_CLASS, "text-muted-foreground", className)}>Загрузка редактора…</div>;

  const run = (command: (chain: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) =>
    command(editor.chain().focus()).run();

  function openLinkBar() {
    const current = editor?.getAttributes("link").href;
    setLinkBar({ url: typeof current === "string" ? current : "", error: false });
  }

  function applyLink() {
    if (!editor || !linkBar) return;
    const href = normalizeUrl(linkBar.url);
    if (!href) {
      setLinkBar({ ...linkBar, error: true });
      return;
    }
    if (editor.state.selection.empty && !editor.isActive("link")) {
      // Ничего не выделено — вставляем сам адрес ссылкой
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkBar(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-0.5">
        <ToolButton label="Заголовок" active={state.h2} onClick={() => run((c) => c.toggleHeading({ level: 2 }))}>
          <Heading2 />
        </ToolButton>
        <ToolButton label="Подзаголовок" active={state.h3} onClick={() => run((c) => c.toggleHeading({ level: 3 }))}>
          <Heading3 />
        </ToolButton>
        <span aria-hidden className="bg-border mx-1 h-5 w-px" />
        <ToolButton label="Жирный" active={state.bold} onClick={() => run((c) => c.toggleBold())}>
          <Bold />
        </ToolButton>
        <ToolButton label="Курсив" active={state.italic} onClick={() => run((c) => c.toggleItalic())}>
          <Italic />
        </ToolButton>
        <ToolButton label="Подчёркнутый" active={state.underline} onClick={() => run((c) => c.toggleUnderline())}>
          <Underline />
        </ToolButton>
        <ToolButton label="Ссылка" active={state.link} onClick={openLinkBar}>
          <Link2 />
        </ToolButton>
        <span aria-hidden className="bg-border mx-1 h-5 w-px" />
        <ToolButton label="Маркированный список" active={state.bullet} onClick={() => run((c) => c.toggleBulletList())}>
          <List />
        </ToolButton>
        <ToolButton
          label="Нумерованный список"
          active={state.ordered}
          onClick={() => run((c) => c.toggleOrderedList())}
        >
          <ListOrdered />
        </ToolButton>
        <ToolButton label="Цитата" active={state.quote} onClick={() => run((c) => c.toggleBlockquote())}>
          <Quote />
        </ToolButton>
        <span aria-hidden className="bg-border mx-1 h-5 w-px" />
        <ToolButton label="Убрать форматирование" onClick={() => run((c) => c.clearNodes().unsetAllMarks())}>
          <RemoveFormatting />
        </ToolButton>
        <ToolButton label="Отменить" disabled={!state.canUndo} onClick={() => run((c) => c.undo())}>
          <Undo2 />
        </ToolButton>
        <ToolButton label="Повторить" disabled={!state.canRedo} onClick={() => run((c) => c.redo())}>
          <Redo2 />
        </ToolButton>
      </div>

      {linkBar ? (
        <form
          className="flex flex-wrap items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <Input
            autoFocus
            value={linkBar.url}
            onChange={(event) => setLinkBar({ url: event.target.value, error: false })}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setLinkBar(null);
                editor.chain().focus().run();
              }
            }}
            placeholder="https://bus-com.ru/…"
            aria-label="Адрес ссылки"
            aria-invalid={linkBar.error}
            className="h-8 max-w-sm min-w-48 flex-1"
          />
          <Button type="submit" size="sm">
            Применить
          </Button>
          {state.link ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setLinkBar(null);
              }}
            >
              Убрать ссылку
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => setLinkBar(null)}>
            Отмена
          </Button>
          {linkBar.error ? (
            <span className="text-destructive text-xs">Нужен адрес вида https://… или bus-com.ru</span>
          ) : null}
        </form>
      ) : null}

      <div className="relative">
        <EditorContent editor={editor} />
        {editor.isEmpty && placeholder ? (
          <span className="text-muted-foreground pointer-events-none absolute top-2 left-3 text-sm">{placeholder}</span>
        ) : null}
      </div>
    </div>
  );
}
