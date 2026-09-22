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
 * - в подписи — реквизиты клиента, не нашей компании (включая банковские): при
 *   прямой поставке клиенту документы и расчёты идут на его юрлицо, а не наше.
 *
 * Функция чистая: ни БД, ни Next. Формат фиксирован — правится здесь и в тесте.
 */
import type { CustomerRequisites } from "@/domain/customer/requisites";
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
   * поставке от поставщика клиенту (адрес доставки — его) документы и расчёты
   * идут на это юрлицо, поэтому нужны его реквизиты целиком, включая банк.
   */
  customer: {
    name: string;
    phone: string | null;
    inn: string | null;
    kpp: string | null;
    requisites: CustomerRequisites;
  };
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
 * Клиент-покупатель целиком: юр. название, ИНН/КПП, юр. адрес, ОГРН, банк
 * с р/с, к/с и БИК, телефон. Юр. название приоритетнее рабочего имени, если
 * оно заполнено (`CustomerRequisites` — то же, что в реквизитах для договоров
 * в карточке клиента и в счёте, `src/server/documents/invoice.ts`). Не наша
 * компания: при прямой поставке клиенту документы и оплата идут на его юрлицо.
 * Незаполненные поля из блока просто выпадают, а не показываются пустыми.
 */
function customerLines(customer: SupplierRequestInput["customer"]): string[] {
  const { requisites } = customer;
  const lines: string[] = [`Покупатель: ${requisites.legalName || customer.name}`];

  const inn = [customer.inn && `ИНН ${customer.inn}`, customer.kpp && `КПП ${customer.kpp}`].filter(Boolean).join(", ");
  if (inn) lines.push(inn);

  if (requisites.legalAddress) lines.push(requisites.legalAddress);
  if (requisites.ogrn) lines.push(`ОГРН ${requisites.ogrn}`);

  const bank = [
    requisites.bankName && `Банк: ${requisites.bankName}`,
    requisites.bankAccount && `р/с ${requisites.bankAccount}`,
    requisites.correspondentAccount && `к/с ${requisites.correspondentAccount}`,
    requisites.bic && `БИК ${requisites.bic}`,
  ]
    .filter(Boolean)
    .join(", ");
  if (bank) lines.push(bank);

  if (customer.phone) lines.push(`Телефон: ${customer.phone}`);

  return lines;
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

  blocks.push(customerLines(input.customer).join("\n"));

  return blocks.join("\n\n");
}
