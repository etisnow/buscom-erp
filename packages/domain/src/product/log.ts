import type { ProductLogAction } from "@buscom/db/enums";

/** Что товар «показывает» журналу: значения уже в виде текста, чтобы запись читалась без справочников. */
export type ProductLogSnapshot = Record<string, string | boolean | null>;

/** Одна изменённая строка: «Цена: 1 000 ₽ → 1 200 ₽». */
export type ProductLogChange = { label: string; from: string | null; to: string | null };

/** Подписи полей снимка в порядке показа. Поля, которых здесь нет, в журнал не попадают. */
export const PRODUCT_LOG_FIELDS = {
  sku: "Артикул",
  name: "Название",
  description: "Описание",
  category: "Категория",
  price: "Цена",
  compatibility: "Совместимость",
  isActive: "В каталоге",
  isHit: "Хит",
  salonKit: "Комплект на салон",
  seatType: "Тип сиденья",
  slug: "Адрес на сайте",
  metaTitle: "Title",
  metaDescription: "Description",
  suppliers: "Поставщики",
  options: "Опции",
} as const;

export const PRODUCT_LOG_ACTION_LABELS: Record<ProductLogAction, string> = {
  CREATED: "Добавлен",
  UPDATED: "Изменён",
  HIDDEN: "Скрыт",
  SHOWN: "Возвращён в каталог",
  DELETED: "Удалён",
};

/** Длинный текст (описание) в журнале обрезается: целиком он остаётся в самой карточке. */
const MAX_VALUE_LENGTH = 2000;

function present(value: string | boolean | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value ? "да" : "нет";
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
}

/** Изменённые поля двух снимков. `isActive` отдельной строкой не идёт — его показывают действия «Скрыт» и «Возвращён». */
export function diffProductSnapshots(before: ProductLogSnapshot, after: ProductLogSnapshot): ProductLogChange[] {
  const changes: ProductLogChange[] = [];
  for (const [field, label] of Object.entries(PRODUCT_LOG_FIELDS)) {
    if (field === "isActive") continue;
    if (before[field] === after[field]) continue;
    const from = present(before[field]);
    const to = present(after[field]);
    if (from === to) continue;
    changes.push({ label, from, to });
  }
  return changes;
}

/** Основные поля нового товара для записи «Добавлен»: что завели. */
export function describeNewProduct(snapshot: ProductLogSnapshot): ProductLogChange[] {
  return diffProductSnapshots({}, snapshot).filter((change) =>
    ["Артикул", "Название", "Категория", "Цена", "Поставщики", "Опции"].includes(change.label),
  );
}
