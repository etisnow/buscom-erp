import { parsePageText, type PageBlock } from "@buscom/domain/site/page-text";
import { parseInline, stripInline } from "@buscom/domain/site/rich-text";

/**
 * Текст из базы в разметку: страницы сайта и описание товара хранятся простым
 * текстом (packages/domain/src/site/page-text.ts), вёрстка — здесь.
 */
export function PageText({ text }: { text: string }) {
  return <PageBlocks blocks={parsePageText(text)} />;
}

/**
 * Встроенная разметка строки: **жирный**, *курсив*, [ссылка](https://…). Разбор — в домене
 * (rich-text.ts); ссылкой становится только адрес http/https, HTML из базы не выводится.
 */
function Inline({ text }: { text: string }) {
  return parseInline(text).map((span, index) => {
    let node: React.ReactNode = span.text;
    if (span.italic) node = <em>{node}</em>;
    if (span.underline) node = <u>{node}</u>;
    if (span.bold) node = <strong className="text-ink font-semibold">{node}</strong>;
    if (span.href) {
      node = (
        <a href={span.href} target="_blank" rel="noopener noreferrer" className="text-brand underline">
          {node}
        </a>
      );
    }
    return <span key={index}>{node}</span>;
  });
}

function PageBlocks({ blocks }: { blocks: PageBlock[] }) {
  return (
    <div className="text-ink-2 space-y-3">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading":
            return (
              <h2 key={index} className="text-ink pt-4 text-xl font-semibold first:pt-0">
                <Inline text={block.text} />
              </h2>
            );
          case "subheading":
            return (
              <h3 key={index} className="text-ink pt-2 text-lg font-semibold first:pt-0">
                <Inline text={block.text} />
              </h3>
            );
          case "quote":
            return (
              <blockquote key={index} className="border-line border-l-4 pl-4 italic">
                <Inline text={block.text} />
              </blockquote>
            );
          case "paragraph":
            return (
              <p key={index}>
                <Inline text={block.text} />
              </p>
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={index} className={`${block.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline text={item} />
                  </li>
                ))}
              </List>
            );
          }
          case "faq":
            return (
              <div key={index} className="divide-line border-line divide-y rounded-lg border bg-white">
                {block.items.map((item) => (
                  <details key={item.question} className="p-4">
                    <summary className="text-ink cursor-pointer font-medium">
                      <Inline text={item.question} />
                    </summary>
                    {item.answer && (
                      <p className="mt-2">
                        <Inline text={item.answer} />
                      </p>
                    )}
                  </details>
                ))}
              </div>
            );
        }
      })}
    </div>
  );
}

/**
 * Тот же текст карточками (макет, экран 06): каждый раздел с заголовком — белая
 * карточка, вопросы «? …» — аккордеон справа от заголовка «Частые вопросы».
 */
export function PageSections({ text }: { text: string }) {
  const sections: { heading: string | null; blocks: PageBlock[] }[] = [];
  for (const block of parsePageText(text)) {
    if (block.kind === "heading") sections.push({ heading: block.text, blocks: [] });
    else if (sections.length === 0) sections.push({ heading: null, blocks: [block] });
    else sections[sections.length - 1].blocks.push(block);
  }
  return (
    <div className="grid grid-cols-1 gap-3 md:gap-5 lg:grid-cols-2">
      {sections.map((section, index) => {
        const faq = section.blocks.find((block) => block.kind === "faq");
        if (faq && faq.kind === "faq") {
          return (
            <section
              key={index}
              className="grid gap-4 pt-4 md:pt-8 lg:col-span-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.5fr)] lg:gap-6"
            >
              <h2 className="text-[22px] font-bold md:text-[28px]">
                {section.heading ? stripInline(section.heading) : "Частые вопросы"}
              </h2>
              <div className="card divide-line divide-y px-5 md:px-7">
                {faq.items.map((item) => (
                  <details key={item.question} className="group py-4 md:py-5">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold md:text-[17px] [&::-webkit-details-marker]:hidden">
                      <Inline text={item.question} />
                      <span aria-hidden className="text-brand text-xl leading-none group-open:hidden">
                        +
                      </span>
                      <span aria-hidden className="text-brand hidden text-xl leading-none group-open:inline">
                        −
                      </span>
                    </summary>
                    {item.answer && (
                      <p className="text-ink-2 mt-2.5 text-[15px] leading-relaxed">
                        <Inline text={item.answer} />
                      </p>
                    )}
                  </details>
                ))}
              </div>
            </section>
          );
        }
        return (
          <section key={index} className="card p-5 md:p-7">
            {section.heading && (
              <h2 className="mb-3 text-xl font-bold md:text-[22px]">{stripInline(section.heading)}</h2>
            )}
            <div className="text-[15px] leading-relaxed">
              <PageBlocks blocks={section.blocks} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
