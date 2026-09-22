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
import type { SellerRequisites } from "@/domain/settings";
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
  /** Наша компания — реквизиты продавца из настроек, те же, что и в счёте */
  seller: SellerRequisites;
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
 * Наша компания: название, ИНН/КПП, адрес, банковские реквизиты, телефон —
 * чтобы поставщик мог сразу выписать документы на нужное юрлицо, не запрашивая
 * их отдельно. Менеджера в тексте нет: поставщику отвечают в ту же переписку,
 * из которой пришёл заказ, а лишняя строка в сообщении мешает. Незаполненные
 * реквизиты (администратор не указал их в /admin/dictionaries) просто выпадают
 * из блока, а не показываются пустыми.
 */
function sellerLines(seller: SellerRequisites): string[] {
  const lines: string[] = [];
  if (seller.name) lines.push(seller.name);

  const inn = [seller.inn && `ИНН ${seller.inn}`, seller.kpp && `КПП ${seller.kpp}`].filter(Boolean).join(", ");
  if (inn) lines.push(inn);

  if (seller.address) lines.push(seller.address);

  const bank = [
    seller.bankName && `Банк: ${seller.bankName}`,
    seller.bankAccount && `р/с ${seller.bankAccount}`,
    seller.correspondentAccount && `к/с ${seller.correspondentAccount}`,
    seller.bic && `БИК ${seller.bic}`,
  ]
    .filter(Boolean)
    .join(", ");
  if (bank) lines.push(bank);

  if (seller.phone) lines.push(`Телефон: ${seller.phone}`);

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

  const seller = sellerLines(input.seller);
  if (seller.length > 0) blocks.push(seller.join("\n"));

  return blocks.join("\n\n");
}
