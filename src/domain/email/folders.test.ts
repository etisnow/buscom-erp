import { describe, expect, it } from "vitest";
import { buildFolderTree, flattenFolderTree, type MailFolder } from "./folders";

function folder(path: string, messages: number | null, specialUse: string | null = null): MailFolder {
  return { path, name: path.split("/").at(-1)!, delimiter: "/", specialUse, messages, unseen: 0, selectable: true };
}

describe("buildFolderTree", () => {
  it("вложенность по разделителю, системные папки сверху, суммы со вложенными", () => {
    const tree = buildFolderTree([
      folder("Клиенты/Юрлица", 5),
      folder("Спам", 7, "\\Junk"),
      folder("Клиенты", 10),
      folder("INBOX", 100, "\\Inbox"),
      folder("Клиенты/Физлица", 3),
      folder("Отправленные", 50, "\\Sent"),
    ]);
    expect(flattenFolderTree(tree).map((node) => [node.path, node.depth, node.totalMessages])).toEqual([
      ["INBOX", 0, 100],
      ["Отправленные", 0, 50],
      ["Спам", 0, 7],
      ["Клиенты", 0, 18],
      ["Клиенты/Физлица", 1, 3],
      ["Клиенты/Юрлица", 1, 5],
    ]);
  });

  it("родитель, которого сервер не прислал, достраивается пустым узлом", () => {
    const tree = buildFolderTree([folder("Поставщики/Фургон", 4)]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ path: "Поставщики", selectable: false, messages: null, totalMessages: 4 });
    expect(tree[0].children.map((node) => node.name)).toEqual(["Фургон"]);
  });
});
