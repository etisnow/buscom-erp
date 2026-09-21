/**
 * Текст заказа поставщику: его копируют из карточки заказа и отправляют
 * поставщику в мессенджер или почтой.
 *
 * Правила:
 * - в текст попадают только позиции этого поставщика, у каждого свой заказ;
 * - цены — закупочные, из снимка в позиции (`OrderItem.purchasePriceKopecks`),
 *   а не текущие из прайса: договаривались по той цене, что в заказе;
 * - артикула нет намеренно — у поставщиков свои коды, наш их только путает;
 * - опции позиции обязательны: без них поставщик не поймёт, какой вариант нужен.
 *
 * Функция чистая: ни БД, ни Next. Формат фиксирован — правится здесь и в тесте.
 */
import { formatMoscowDate } from "@/domain/datetime";
import { formatRub, type Kopecks } from "@/domain/money";
import { deliveryMethodLabel } from "@/domain/order/delivery";
import type { OrderItemOption } from "@/domain/product/options";
import type { DeliveryMethod } from "@/generated/prisma/enums";

export type SupplierRequestItem = {
  name: string;
  quantity: number;
  /** Снимок закупочной цены. null — поставщика проставили, а цены у пары нет */
  purchasePriceKopecks: Kopecks | null;
  options: OrderItemOption[];
};

export type SupplierRequestInput = {
  orderNumber: number;
  orderCreatedAt: Date;
  items: SupplierRequestItem[];
  delivery: {
    method: DeliveryMethod | null;
    carrier: string | null;
    address: string | null;
  };
  /** Наша компания — из реквизитов продавца в настройках */
  seller: { name: string; phone: string };
};

/** Позиция без закупочной цены: в сумму не идёт, но из текста не пропадает. */
const NO_PRICE = "цена не указана";

function itemLines(item: SupplierRequestItem, index: number): string[] {
  const lines = [`${index + 1}. ${item.name}`];

  for (const option of item.options) {
    lines.push(`   ${option.optionName}: ${option.valueName}`);
  }

  if (item.purchasePriceKopecks === null) {
    lines.push(`   ${item.quantity} шт — ${NO_PRICE}`);
  } else {
    const sum = item.purchasePriceKopecks * item.quantity;
    lines.push(`   ${item.quantity} шт × ${formatRub(item.purchasePriceKopecks)} = ${formatRub(sum)}`);
  }

  return lines;
}

function deliveryLines(delivery: SupplierRequestInput["delivery"]): string[] {
  const method = deliveryMethodLabel(delivery.method);
  // Транспортная компания уточняет способ и идёт той же строкой, без второго
  // двоеточия: «Доставка: Транспортная компания СДЭК»
  const first = [method, delivery.carrier].filter(Boolean).join(" ") || null;

  const lines: string[] = [];
  if (first) lines.push(`Доставка: ${first}`);
  if (delivery.address) lines.push(`Адрес: ${delivery.address}`);
  return lines;
}

/**
 * Подпись — только наша компания. Менеджера в тексте нет: поставщику отвечают
 * в ту же переписку, из которой пришёл заказ, а лишняя строка в сообщении мешает.
 */
function contactLine(input: SupplierRequestInput): string | null {
  return [input.seller.name, input.seller.phone].filter(Boolean).join(", ") || null;
}

/**
 * Собирает текст. Блоки разделены пустой строкой; пустые блоки не оставляют
 * после себя лишних переносов — текст уходит в мессенджер как есть.
 */
export function buildSupplierRequest(input: SupplierRequestInput): string {
  const blocks: string[] = [`Заказ №${input.orderNumber} от ${formatMoscowDate(input.orderCreatedAt)}`];

  if (input.items.length > 0) {
    blocks.push(input.items.flatMap((item, index) => itemLines(item, index)).join("\n"));

    const priced = input.items.filter((item) => item.purchasePriceKopecks !== null);
    if (priced.length > 0) {
      const total = priced.reduce((sum, item) => sum + (item.purchasePriceKopecks ?? 0) * item.quantity, 0);
      const partial = priced.length < input.items.length ? " (без позиций, у которых нет цены)" : "";
      blocks.push(`Итого: ${formatRub(total)}${partial}`);
    }
  }

  const delivery = deliveryLines(input.delivery);
  if (delivery.length > 0) blocks.push(delivery.join("\n"));

  const contact = contactLine(input);
  if (contact) blocks.push(contact);

  return blocks.join("\n\n");
}
