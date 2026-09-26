/**
 * Описание товара: в базе текст, а не HTML (docs/DECISIONS.md, «Описание товара») —
 * абзацы переводом строки, пункты с «• ». Здесь собираем их обратно в разметку.
 */
export function Description({ text }: { text: string }) {
  const blocks: ({ kind: "p"; text: string } | { kind: "ul"; items: string[] })[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("• ")) {
      const last = blocks.at(-1);
      if (last?.kind === "ul") last.items.push(line.slice(2));
      else blocks.push({ kind: "ul", items: [line.slice(2)] });
    } else blocks.push({ kind: "p", text: line });
  }
  return (
    <div className="text-ink-2 space-y-3">
      {blocks.map((block, index) =>
        block.kind === "p" ? (
          <p key={index}>{block.text}</p>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
