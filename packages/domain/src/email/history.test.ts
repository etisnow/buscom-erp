import { describe, expect, it } from "vitest";
import type { MailFolder } from "./folders";
import {
  counterparts,
  defaultHistoryFolders,
  headerValue,
  historySince,
  htmlToText,
  isClientLetter,
  letterParts,
} from "./history";

function folder(path: string, specialUse: string | null, selectable = true): MailFolder {
  return { path, name: path, delimiter: "/", specialUse, messages: 10, unseen: 0, selectable };
}

describe("defaultHistoryFolders", () => {
  it("без спама, удалённых, черновиков и узлов без писем; «Отправленные» — наши письма", () => {
    const folders = defaultHistoryFolders([
      folder("INBOX", "\\Inbox"),
      folder("Sent", "\\Sent"),
      folder("Spam", "\\Junk"),
      folder("Trash", "\\Trash"),
      folder("Drafts", "\\Drafts"),
      folder("Drafts/template", null),
      folder("Клиенты", null),
      folder("Узел", null, false),
    ]);
    expect(folders.map((f) => [f.path, f.direction])).toEqual([
      ["INBOX", "INBOUND"],
      ["Sent", "OUTBOUND"],
      ["Клиенты", "INBOUND"],
    ]);
  });
});

describe("отбор писем", () => {
  const customers = new Set(["client@mail.ru"]);
  const own = new Set(["info@bus-com.ru"]);

  it("входящее — по отправителю, наше — по получателям и копии", () => {
    const envelope = {
      from: [{ address: "Client@Mail.ru" }],
      to: [{ address: "info@bus-com.ru" }],
      cc: [{ address: "other@x.ru" }],
    };
    expect(counterparts("INBOUND", envelope)).toEqual(["client@mail.ru"]);
    expect(counterparts("OUTBOUND", envelope)).toEqual(["info@bus-com.ru", "other@x.ru"]);
  });

  it("письмо с клиентом — если собеседник среди клиентов и это не мы сами", () => {
    expect(isClientLetter(["client@mail.ru"], customers, own)).toBe(true);
    expect(isClientLetter(["supplier@x.ru"], customers, own)).toBe(false);
    expect(isClientLetter(["info@bus-com.ru"], new Set(["info@bus-com.ru"]), own)).toBe(false);
  });

  it("период — ровно N лет назад", () => {
    expect(historySince(new Date("2026-09-25T12:00:00Z")).toISOString()).toBe("2023-09-25T12:00:00.000Z");
  });
});

describe("letterParts", () => {
  it("текст — text/plain, вложения — по disposition и имени, картинки в HTML не вложения", () => {
    const parts = letterParts({
      type: "multipart/mixed",
      childNodes: [
        {
          type: "multipart/alternative",
          childNodes: [
            { part: "1.1", type: "text/plain" },
            { part: "1.2", type: "text/html" },
          ],
        },
        { part: "2", type: "image/png", disposition: "inline", parameters: { name: "logo.png" } },
        {
          part: "3",
          type: "application/pdf",
          disposition: "attachment",
          dispositionParameters: { filename: "реквизиты.pdf" },
          size: 1000,
        },
      ],
    });
    expect(parts).toEqual({
      text: { part: "1.1", html: false },
      attachments: [{ fileName: "реквизиты.pdf", contentType: "application/pdf", size: 1000 }],
    });
  });

  it("только HTML — берём его; простое письмо без частей — часть 1", () => {
    expect(letterParts({ type: "multipart/alternative", childNodes: [{ part: "1", type: "text/html" }] }).text).toEqual(
      {
        part: "1",
        html: true,
      },
    );
    expect(letterParts({ type: "text/plain" }).text).toEqual({ part: "1", html: false });
  });
});

describe("htmlToText", () => {
  it("абзацы и переносы сохраняются, разметка и стили — нет", () => {
    const html =
      "<html><head><style>p{}</style></head><body><p>Здравствуйте!</p><div>Счёт&nbsp;во&nbsp;вложении<br>Иван</div><ul><li>один</li></ul>&laquo;ок&raquo; &#8212;</body></html>";
    expect(htmlToText(html)).toBe("Здравствуйте!\nСчёт во вложении\nИван\n• один\n«ок» —");
  });
});

describe("headerValue", () => {
  it("склеивает перенесённые строки заголовка", () => {
    const raw = "Subject: Тест\r\nReferences: <a@x>\r\n <b@x>\r\nIn-Reply-To: <b@x>\r\n";
    expect(headerValue(raw, "References")).toBe("<a@x> <b@x>");
    expect(headerValue(raw, "In-Reply-To")).toBe("<b@x>");
    expect(headerValue(raw, "X-None")).toBeNull();
  });
});
