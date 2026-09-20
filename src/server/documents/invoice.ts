import "server-only";
import type { Alignment, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { formatMoscowDate } from "@/domain/datetime";
import { formatRub } from "@/domain/money";
import { kopecksToWords } from "@/domain/money-words";
import type { SellerRequisites } from "@/domain/settings";
import type { OrderDetails } from "@/server/orders/details";

/** Счёт на оплату для юрлиц (PRD, M1.8). Реквизиты продавца — из настроек. */
export function buildInvoice(order: OrderDetails, seller: SellerRequisites): TDocumentDefinitions {
  const right: Alignment = "right";

  const itemsBody: TableCell[][] = [
    [
      { text: "№", style: "th" },
      { text: "Артикул", style: "th" },
      { text: "Наименование", style: "th" },
      { text: "Кол-во", style: "th", alignment: right },
      { text: "Цена", style: "th", alignment: right },
      { text: "Сумма", style: "th", alignment: right },
    ],
    ...order.items.map((item, index) => [
      { text: String(index + 1) },
      { text: item.sku },
      { text: item.name },
      { text: String(item.quantity), alignment: right },
      { text: formatRub(item.priceKopecks), alignment: right },
      {
        text: formatRub(item.priceKopecks * item.quantity - item.discountKopecks),
        alignment: right,
      },
    ]),
  ];

  const totals: { label: string; value: number; bold?: boolean }[] = [
    { label: "Товары", value: order.itemsTotalKopecks },
  ];
  if (order.discountKopecks > 0) totals.push({ label: "Скидка на заказ", value: -order.discountKopecks });
  if (order.deliveryPriceKopecks > 0) totals.push({ label: "Доставка", value: order.deliveryPriceKopecks });
  totals.push({ label: "Итого к оплате", value: order.totalKopecks, bold: true });

  return {
    pageSize: "A4",
    pageMargins: [40, 40, 40, 40],
    info: { title: `Счёт № ${order.number}` },
    content: [
      {
        text: seller.name || "Реквизиты продавца не заполнены",
        style: "sellerName",
      },
      {
        // Реквизиты продавца заполняет администратор в /admin/dictionaries.
        text: [
          seller.inn ? `ИНН ${seller.inn}` : "",
          seller.kpp ? `, КПП ${seller.kpp}` : "",
          seller.address ? `\n${seller.address}` : "",
          seller.bankName ? `\nБанк: ${seller.bankName}` : "",
          seller.bankAccount ? `\nР/с ${seller.bankAccount}` : "",
          seller.correspondentAccount ? `, к/с ${seller.correspondentAccount}` : "",
          seller.bic ? `, БИК ${seller.bic}` : "",
          seller.phone ? `\nТелефон: ${seller.phone}` : "",
        ]
          .filter(Boolean)
          .join(""),
        style: "small",
        margin: [0, 0, 0, 12],
      },
      {
        text: `Счёт на оплату № ${order.number} от ${formatMoscowDate(order.createdAt)}`,
        style: "title",
      },
      {
        text: [
          { text: "Покупатель: ", bold: true },
          order.customer.name,
          order.customer.inn ? `, ИНН ${order.customer.inn}` : "",
          order.customer.kpp ? `, КПП ${order.customer.kpp}` : "",
        ],
        margin: [0, 0, 0, 10],
      },
      {
        table: { headerRows: 1, widths: [18, 70, "*", 40, 60, 65], body: itemsBody },
        layout: "lightHorizontalLines",
      },
      {
        margin: [0, 10, 0, 0],
        columns: [
          { text: "" },
          {
            width: "auto",
            table: {
              body: totals.map((row): TableCell[] => [
                { text: row.label, alignment: right, bold: row.bold ?? false },
                { text: formatRub(row.value), alignment: right, bold: row.bold ?? false },
              ]),
            },
            layout: "noBorders",
          },
        ],
      },
      {
        text: `Всего наименований ${order.items.length}, на сумму ${formatRub(order.totalKopecks)}`,
        margin: [0, 10, 0, 2],
        style: "small",
      },
      { text: kopecksToWords(order.totalKopecks), bold: true, margin: [0, 0, 0, 20] },
      {
        text: "НДС не выделен. Оплата настоящего счёта означает согласие с условиями поставки.",
        style: "small",
        margin: [0, 0, 0, 24],
      },
      {
        columns: [
          { text: `Руководитель ______________________ ${seller.signerName}`, style: "small" },
          { text: "Бухгалтер ______________________", style: "small", alignment: "right" },
        ],
      },
    ],
    styles: {
      sellerName: { fontSize: 12, bold: true, margin: [0, 0, 0, 2] },
      title: { fontSize: 14, bold: true, margin: [0, 0, 0, 8] },
      th: { bold: true, fontSize: 9 },
      small: { fontSize: 8, color: "#444444" },
    },
  };
}
