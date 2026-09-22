/**
 * Текст заказа поставщику: его копируют из карточки заказа и отправляют
 * поставщику в мессенджер или почтой.
 *
 * Правила:
 * - в текст попадают только позиции этого поставщика, у каждого свой заказ;
 * - цены — закупочные, из снимка в позиции (`OrderItem.purchasePriceKopecks`),
 *   а не текущие из прайса: договаривались по той цене, что в заказе;
 * - артикула нет намеренно — у поставщиков свои коды, наш их только путает;
 * - опции позиции обязательны: без них поставщик не поймёт, какой вариант нужен;
 * - в подписи — реквизиты клиента (ИНН/КПП), не нашей компании: при прямой
 *   поставке клиенту документы поставщик выписывает на его юрлицо.
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
  /**
   * Клиент, для которого заказаны позиции — не наша компания. При прямой
   * поставке от поставщика клиенту (адрес доставки — его) документы поставщик
   * выписывает на это юрлицо, поэтому ИНН/КПП нужны именно клиента.
   */
  customer: { name: string; inn: string | null; kpp: string | null };
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
 * Клиент-покупатель: тем же форматом, что и «Покупатель» в счёте (`buildInvoice`
 * в `src/server/documents/invoice.ts`) — держать их в одном виде специально не
 * стали (разные слои, `pdfmake` не отсюда), но текст должен читаться одинаково.
 * ИНН/КПП есть не у всех — у физлица или у юрлица без реквизитов строка,
 * которую с ними не собрать, просто не добавляется.
 */
function customerLine(customer: SupplierRequestInput["customer"]): string {
  const requisites = [customer.inn && `ИНН ${customer.inn}`, customer.kpp && `КПП ${customer.kpp}`]
    .filter(Boolean)
    .join(", ");

  return [`Покупатель: ${customer.name}`, requisites].filter(Boolean).join(", ");
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

  blocks.push(customerLine(input.customer));

  return blocks.join("\n\n");
}
