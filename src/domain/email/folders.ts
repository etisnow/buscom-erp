/**
 * Папки общего ящика — чтобы увидеть, как почта разложена в клиенте (Яндекс,
 * фильтры по папкам). ERP читает только «Входящие», и по дереву видно, не
 * уходят ли письма клиентов мимо неё.
 */

export type MailFolder = {
  path: string;
  name: string;
  /** Разделитель уровней, обычно «/» или «|» */
  delimiter: string;
  /** \Inbox, \Sent, \Trash… — по флагу сервера или по известному названию */
  specialUse: string | null;
  messages: number | null;
  unseen: number | null;
  /** Папка-узел без писем (\Noselect): только держит вложенные */
  selectable: boolean;
};

export type MailFolderNode = MailFolder & { depth: number; children: MailFolderNode[]; totalMessages: number };

export const SPECIAL_FOLDER_LABELS: Record<string, string> = {
  "\Inbox": "Входящие",
  "\Sent": "Отправленные",
  "\Drafts": "Черновики",
  "\Trash": "Удалённые",
  "\Junk": "Спам",
  "\Archive": "Архив",
};

/** Системные папки — сверху в привычном порядке, остальные по алфавиту. */
const SPECIAL_ORDER = ["\Inbox", "\Sent", "\Drafts", "\Archive", "\Junk", "\Trash"];

function compare(a: MailFolder, b: MailFolder): number {
  const ai = a.specialUse ? SPECIAL_ORDER.indexOf(a.specialUse) : -1;
  const bi = b.specialUse ? SPECIAL_ORDER.indexOf(b.specialUse) : -1;
  if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  return a.name.localeCompare(b.name, "ru");
}

/**
 * Плоский список папок — в дерево. Родителя, которого сервер не прислал (так
 * бывает с узлами-разделителями), достраиваем пустым узлом. `totalMessages` —
 * письма в папке вместе со вложенными.
 */
export function buildFolderTree(folders: MailFolder[]): MailFolderNode[] {
  const byPath = new Map<string, MailFolderNode>();
  const roots: MailFolderNode[] = [];

  const ensure = (folder: MailFolder): MailFolderNode => {
    const existing = byPath.get(folder.path);
    if (existing) {
      Object.assign(existing, folder, { children: existing.children, depth: existing.depth });
      return existing;
    }
    const node: MailFolderNode = { ...folder, depth: 0, children: [], totalMessages: 0 };
    byPath.set(folder.path, node);
    const cut = folder.delimiter ? folder.path.lastIndexOf(folder.delimiter) : -1;
    if (cut > 0) {
      const parentPath = folder.path.slice(0, cut);
      const parent =
        byPath.get(parentPath) ??
        ensure({
          path: parentPath,
          name: parentPath.slice(parentPath.lastIndexOf(folder.delimiter) + 1),
          delimiter: folder.delimiter,
          specialUse: null,
          messages: null,
          unseen: null,
          selectable: false,
        });
      parent.children.push(node);
    } else roots.push(node);
    return node;
  };

  for (const folder of folders) ensure(folder);

  const finish = (nodes: MailFolderNode[], depth: number): number => {
    nodes.sort(compare);
    let sum = 0;
    for (const node of nodes) {
      node.depth = depth;
      node.totalMessages = (node.messages ?? 0) + finish(node.children, depth + 1);
      sum += node.totalMessages;
    }
    return sum;
  };
  finish(roots, 0);
  return roots;
}

/** Дерево — в плоский список по порядку обхода: так его проще нарисовать с отступами. */
export function flattenFolderTree(nodes: MailFolderNode[]): MailFolderNode[] {
  return nodes.flatMap((node) => [node, ...flattenFolderTree(node.children)]);
}
