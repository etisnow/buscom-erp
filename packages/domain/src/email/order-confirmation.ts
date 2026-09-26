import { formatRub, type Kopecks } from "../money";
import { describeOptions, type OrderItemOption } from "../product/options";

/**
 * Письмо покупателю о принятом заказе с сайта (docs/SITE-PRD.md, «Заказ с сайта»,
 * п. 5). Уходит из ERP сразу после создания заказа — только для заказов нового
 * сайта: старый OpenCart своё письмо отправлял сам.
 */

export type ConfirmationOrder = {
  number: number;
  customerName: string;
  items: { name: string; sku: string; quantity: number; priceKopecks: Kopecks; options: OrderItemOption[] }[];
  totalKopecks: Kopecks;
  deliveryMethod: "PICKUP" | "CARRIER" | "COURIER" | null;
  carrier: string | null;
  deliveryAddress: string | null;
};

export type ConfirmationContacts = { phone: string; email: string; pickupAddress: string; hours: string };

export const CONFIRMATION_TEMPLATE = "site_order";

export function orderConfirmationLetter(
  order: ConfirmationOrder,
  contacts: ConfirmationContacts,
): { subject: string; body: string } {
  const lines = order.items.map((item) => {
    const price = item.priceKopecks > 0 ? formatRub(item.priceKopecks * item.quantity) : "цена по запросу";
    const options = item.options.length > 0 ? ` (${describeOptions(item.options)})` : "";
    return `• ${item.name}${options}, арт. ${item.sku} — ${item.quantity} шт., ${price}`;
  });
  const hasPriceOnRequest = order.items.some((item) => item.priceKopecks === 0);
  const delivery =
    order.deliveryMethod === "PICKUP"
      ? `Самовывоз со склада: ${contacts.pickupAddress}. ${contacts.hours}.`
      : `Доставка: ${[order.carrier, order.deliveryAddress].filter(Boolean).join(", ") || "транспортной компанией"}. Стоимость доставки оплачивается транспортной компании и в сумму заказа не входит.`;

  return {
    subject: `Заказ № ${order.number} принят — Баском`,
    body: [
      `${order.customerName}, здравствуйте!`,
      "",
      `Мы получили ваш заказ № ${order.number}:`,
      "",
      ...lines,
      "",
      `Итого: ${formatRub(order.totalKopecks)}${hasPriceOnRequest ? " (без товаров с ценой по запросу)" : ""}`,
      delivery,
      "",
      "Менеджер свяжется с вами, подтвердит наличие и сроки и пришлёт счёт или реквизиты для оплаты.",
      "",
      `Вопросы по заказу — ${contacts.phone} или ответом на это письмо, назовите номер заказа.`,
      "",
      "Баском — комплектующие для микроавтобусов",
      contacts.email,
    ].join("\n"),
  };
}
