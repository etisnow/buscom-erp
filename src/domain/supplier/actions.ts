/**
 * Раздел «Действия и артефакты» у поставщика (docs/DECISIONS.md). Каждая функция —
 * чекбокс с описанием; включённые у поставщика функции показываются у него в
 * заказе (кнопка или загрузчик файла), выключенные — нет. Список фиксирован
 * в коде — новую функцию добавляют здесь, а не через настройки.
 *
 * Хранится `Supplier.enabledActions: String[]` — список ключей отсюда.
 */

export type SupplierActionKind =
  /** Кнопка, открывающая что-то готовое (диалог, текст) */
  | "button"
  /** Загрузчик файла — прикладывается к конкретному заказу у этого поставщика */
  | "uploader";

export type SupplierActionDefinition = {
  key: string;
  label: string;
  description: string;
  kind: SupplierActionKind;
};

export const SUPPLIER_ACTIONS = [
  {
    key: "SUPPLIER_REQUEST",
    label: "Заказ поставщику",
    description: "Формирование позиций заказа и реквизитов клиента для запроса счёта у поставщика",
    kind: "button",
  },
  {
    key: "SUPPLIER_INVOICE",
    label: "Прикрепить счёт поставщика клиенту",
    description: "Прямой счёт от поставщика клиенту с заложенной туда прибылью",
    kind: "uploader",
  },
] as const satisfies SupplierActionDefinition[];

export type SupplierActionKey = (typeof SUPPLIER_ACTIONS)[number]["key"];

const VALID_KEYS = new Set<string>(SUPPLIER_ACTIONS.map((action) => action.key));

/** Ключ существует в реестре сейчас. Функцию убрали из кода — старый ключ в поставщике не подходит. */
export function isSupplierActionKey(value: string): value is SupplierActionKey {
  return VALID_KEYS.has(value);
}

/**
 * Список из формы/базы к рабочему виду: неизвестные ключи (функцию переименовали
 * или убрали) отбрасываются молча, а не ломают поставщика. Порядок и повторы
 * не важны — используется только через `hasSupplierAction`.
 */
export function normalizeEnabledActions(keys: readonly string[]): SupplierActionKey[] {
  return [...new Set(keys)].filter(isSupplierActionKey);
}

export function hasSupplierAction(enabledActions: readonly string[], key: SupplierActionKey): boolean {
  return enabledActions.includes(key);
}
