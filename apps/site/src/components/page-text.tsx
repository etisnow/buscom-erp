import { parsePageText } from "@buscom/domain/site/page-text";

/**
 * Текст из базы в разметку: страницы сайта и описание товара хранятся простым
 * текстом (packages/domain/src/site/page-text.ts), вёрстка — здесь.
 */
export function PageText({ text }: { text: string }) {
  return (
    <div className="text-ink-2 space-y-3">
      {parsePageText(text).map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <h2 key={index} className="text-ink pt-4 text-xl font-semibold first:pt-0">
                {block.text}
              </h2>
            );
          case "paragraph":
            return <p key={index}>{block.text}</p>;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={index} className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </List>
            );
          }
          case "faq":
            return (
              <div key={index} className="divide-line border-line divide-y rounded-lg border bg-white">
                {block.items.map((item) => (
                  <details key={item.question} className="p-4">
                    <summary className="text-ink cursor-pointer font-medium">{item.question}</summary>
                    {item.answer && <p className="mt-2">{item.answer}</p>}
                  </details>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}
