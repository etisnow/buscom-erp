import { rublesToKopecks, type Kopecks } from "@/domain/money";
import type { DeliveryMethod } from "@/generated/prisma/enums";

/**
 * Разбор строки выгрузки заказов из прежней ERP. Чистая функция: файл читает и в
 * базу пишет серверный слой. Решения по полям — `docs/STATUS.md`, «Выгрузка заказов».
 *
 * Главное, чего в источнике нет, — позиций заказа. Есть одна строка «Описание» и
 * общая сумма, поэтому заказ получает ровно одну позицию на всю сумму: иначе итог
 * (его считает сервер из позиций) разошёлся бы с суммой к оплате.
 */

/** Артикул синтетической позиции: по нему такие строки видно и в выгрузке, и в поиске. */
export const LEGACY_ITEM_SKU = "ИМПОРТ";

export type LegacyOrder = {
  /** `ID` строки прежней ERP — уникален, служит ключом повторного прогона. */
  externalId: string;
  /** Дата заказа: становится и `createdAt`, и временем смены статуса. */
  createdAt: Date;
  customerName: string;
  customerEmail: string | null;
  itemName: string;
  totalKopecks: Kopecks;
  paidKopecks: Kopecks;
  discountKopecks: Kopecks;
  paidAt: Date | null;
  deliveryMethod: DeliveryMethod | null;
  carrier: string | null;
  /** Сведения, которым в полях заказа места нет: уходят в журнал отдельной записью. */
  note: string;
};

/** «18.08.2026» и «18.08.2026 12:19» → Date. Время в файле московское. */
export function parseLegacyDate(raw: string): Date | null {
  const match = raw.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!match) return null;

  const [, day, month, year, hour = "00", minute = "00"] = match;
  // Москва — UTC+3 круглый год, перехода на летнее время нет с 2014-го.
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00+03:00`);
}

function money(raw: string): Kopecks {
  const value = raw.trim();
  if (!value) return 0;
  try {
    return rublesToKopecks(value);
  } catch {
    // Единичная кривая ячейка не должна ронять прогон на 3000 строк.
    return 0;
  }
}

/** «Самовывоз» — это способ доставки, остальное — транспортная компания. */
function delivery(raw: string): { method: DeliveryMethod | null; carrier: string | null } {
  const value = raw.trim();
  if (!value) return { method: null, carrier: null };
  if (value.toLowerCase() === "самовывоз") return { method: "PICKUP", carrier: null };

  // «Любая» и «Другая» — не названия перевозчиков, но это то, что записали; оставляем как есть.
  return { method: "CARRIER", carrier: value };
}

export function parseLegacyOrder(row: Record<string, string>): LegacyOrder | null {
  const g = (key: string) => (row[key] ?? "").trim();

  const externalId = g("ID");
  const createdAt = parseLegacyDate(g("Дата")) ?? parseLegacyDate(g("Время добавления"));
  if (!externalId || !createdAt) return null;

  const total = money(g("Сумма к оплате")) || money(g("Сумма"));
  const paid = money(g("Оплачено"));
  const { method, carrier } = delivery(g("Транспортная компания"));

  const note = [
    `Заказ перенесён из прежней ERP (ID ${externalId}).`,
    g("Номер") ? `Номер там: ${g("Номер")}.` : "",
    g("Кто добавил") ? `Оформил: ${g("Кто добавил")}.` : "",
    g("Статус отправки") ? `Статус отправки: ${g("Статус отправки")}.` : "",
    g("Дата готовности") ? `Дата готовности: ${g("Дата готовности")}.` : "",
    money(g("Сумма НДС")) ? `В сумме был выделен НДС: ${g("Сумма НДС")} ₽.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    externalId,
    createdAt,
    customerName: g("На кого"),
    customerEmail:
      g("E-mail")
        .split(/[,;\s]+/)
        .find((part) => part.includes("@"))
        ?.toLowerCase() ?? null,
    itemName: g("Описание") || "Заказ из прежней ERP",
    totalKopecks: total,
    // Переплату в источнике не переносим: статус оплаты считается из суммы платежей,
    // и «Переплата» на трёхлетнем архиве выглядела бы как ошибка, а не как факт.
    paidKopecks: Math.min(paid, total),
    discountKopecks: money(g("Сумма скидок")),
    paidAt: parseLegacyDate(g("Дата п/п")),
    deliveryMethod: method,
    carrier,
    note,
  };
}
