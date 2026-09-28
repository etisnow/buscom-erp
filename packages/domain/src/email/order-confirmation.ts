import { formatRub, type Kopecks } from "../money";
import { describeOptions, type OrderItemOption } from "../product/options";

/**
 * Письмо покупателю о принятом заказе с сайта (docs/SITE-PRD.md, «Заказ с сайта»,
 * п. 5). Уходит из ERP сразу после создания заказа — только для заказов нового
 * сайта: старый OpenCart своё письмо отправлял сам. HTML по макету владельца,
 * текстовая версия — для почтовых программ без HTML и для переписки в ERP.
 */

export type ConfirmationItem = {
  name: string;
  sku: string;
  quantity: number;
  priceKopecks: Kopecks;
  options: OrderItemOption[];
  /** Карточка товара на сайте; null — товара на сайте нет */
  url: string | null;
  /** Превью снимка, полный адрес */
  imageUrl: string | null;
};

export type ConfirmationOrder = {
  number: number;
  customerName: string;
  items: ConfirmationItem[];
  totalKopecks: Kopecks;
  deliveryMethod: "PICKUP" | "CARRIER" | "COURIER" | null;
  carrier: string | null;
  deliveryAddress: string | null;
  /** Юрлицу — счёт, частному лицу — перевод на карту (решение владельца 24.09.2026) */
  payment: "INVOICE" | "CARD";
};

/** Карта для переводов частных лиц — из реквизитов продавца в справочниках ERP */
export type TransferCard = { bank: string; number: string; holder: string };

export type ConfirmationContacts = {
  phone: string;
  phoneHref: string;
  email: string;
  pickupAddress: string;
  hours: string;
  /** Адрес сайта без «/» в конце — ссылки и картинки письма */
  siteUrl: string;
  /** Не заполнена — вместо инструкции «реквизиты пришлёт менеджер» */
  card: TransferCard | null;
};

export const CONFIRMATION_TEMPLATE = "site_order";

const INVOICE_TEXT = "Подготовим счёт на оплату и пришлем Вам на эту почту";

/** Номер карты группами по 4 цифры: «4276420038523139» → «4276 4200 3852 3139» */
export function formatCardNumber(number: string): string {
  return number.replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** Инструкция для Сбербанка — из макета; для другого банка — общая */
function cardSteps(card: TransferCard): { title: string; open: string } {
  const sber = /сбер/i.test(card.bank);
  return {
    title: sber ? "Сбербанк Онлайн" : card.bank ? `Перевод на карту · ${card.bank}` : "Перевод на карту",
    open: sber
      ? "Откройте «Платежи и переводы» → «Перевод клиенту Сбербанка»."
      : "Откройте приложение банка и выберите перевод по номеру карты.",
  };
}

function lineTotal(item: ConfirmationItem): Kopecks {
  return item.priceKopecks * item.quantity;
}

function hasPriceOnRequest(order: ConfirmationOrder): boolean {
  return order.items.some((item) => item.priceKopecks === 0);
}

export function orderConfirmationLetter(
  order: ConfirmationOrder,
  contacts: ConfirmationContacts,
): { subject: string; body: string; html: string } {
  const lines = order.items.map((item) => {
    const price = item.priceKopecks > 0 ? formatRub(lineTotal(item)) : "цена по запросу";
    const options = item.options.length > 0 ? ` (${describeOptions(item.options)})` : "";
    return `• ${item.name}${options}, арт. ${item.sku} — ${item.quantity} шт., ${price}`;
  });
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
      `Итого: ${formatRub(order.totalKopecks)}${hasPriceOnRequest(order) ? " (без товаров с ценой по запросу)" : ""}`,
      delivery,
      "",
      "Менеджер свяжется с вами и подтвердит наличие и сроки.",
      "",
      ...paymentText(order, contacts.card),
      "",
      `Вопросы по заказу — ${contacts.phone} или ответом на это письмо, назовите номер заказа.`,
      "",
      "Баском — комплектующие для микроавтобусов",
      contacts.email,
    ].join("\n"),
    html: orderConfirmationHtml(order, contacts),
  };
}

function paymentText(order: ConfirmationOrder, card: TransferCard | null): string[] {
  if (order.payment === "INVOICE") return [`Оплата: ${INVOICE_TEXT}.`];
  if (!card) return ["Оплата: реквизиты для перевода пришлёт менеджер."];
  const steps = cardSteps(card);
  const amount = hasPriceOnRequest(order) ? "сумму, которую подтвердит менеджер," : formatRub(order.totalKopecks);
  return [
    `Оплата — ${steps.title}:`,
    `1. ${steps.open}`,
    `2. Переведите ${amount} на карту ${formatCardNumber(card.number)}, получатель: ${card.holder}.`,
    `3. В комментарии к переводу укажите номер заказа: ${order.number}.`,
  ];
}

// ─── HTML ────────────────────────────────────────────────────────────────────
// Вёрстка таблицами и стилями в атрибутах: так её понимают Outlook, Gmail,
// почта Яндекса и Mail.ru. Тёмная тема — классами, где клиент их поддерживает.

const FONT = "Arial,Helvetica,sans-serif";
const MONO = "'Courier New',Courier,monospace";
const INK = "#15191e";
const MUTE = "#5a6370";
const MUTE_2 = "#46505c";
const LINE = "#e3e6e3";
const BRAND = "#008244";
const SOFT = "#f5f6f5";

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** Сумма без переноса внутри: пробелы-разделители → неразрывные */
function rub(kopecks: Kopecks): string {
  return esc(formatRub(kopecks)).replace(/\s/g, "&nbsp;");
}

function caption(text: string): string {
  return `<div class="mute" style="font-family:${MONO};font-size:12px;line-height:16px;letter-spacing:1px;color:${MUTE}">${esc(text.toUpperCase())}</div>`;
}

function itemRow(item: ConfirmationItem): string {
  const image = item.imageUrl
    ? `<img src="${esc(item.imageUrl)}" width="80" height="80" alt="${esc(item.name)}" style="display:block;width:80px;height:80px;border:0;outline:none;border-radius:6px;object-fit:contain;font-family:${FONT};font-size:11px;color:${MUTE}">`
    : `<div style="width:80px;height:80px;border-radius:6px;background:${SOFT}"></div>`;
  const nameStyle = `font-family:${FONT};font-size:15px;line-height:21px;font-weight:bold;color:${INK};text-decoration:none`;
  const name = item.url
    ? `<a href="${esc(item.url)}" class="ink" style="${nameStyle}">${esc(item.name)}</a>`
    : `<span class="ink" style="${nameStyle}">${esc(item.name)}</span>`;
  const picture = item.url ? `<a href="${esc(item.url)}" style="text-decoration:none">${image}</a>` : image;
  const options =
    item.options.length > 0
      ? `<div class="mute" style="padding-top:4px;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTE}">${esc(describeOptions(item.options))}</div>`
      : "";
  const each = item.quantity > 1 && item.priceKopecks > 0 ? ` × ${rub(item.priceKopecks)}` : "";
  const price = item.priceKopecks > 0 ? rub(lineTotal(item)) : "цена по&nbsp;запросу";
  return `<tr>
            <td width="88" valign="top" style="padding:18px 0">
              <table role="presentation" width="88" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="88" height="88" align="center" valign="middle" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:10px;padding:4px">${picture}</td>
              </tr></table>
            </td>
            <td valign="top" style="padding:18px 0 18px 16px">
              ${name}${options}
              <div class="mute" style="padding-top:2px;font-family:${MONO};font-size:12px;line-height:18px;color:${MUTE}">арт. ${esc(item.sku)} · ${item.quantity}&nbsp;шт.${each}</div>
            </td>
            <td valign="top" align="right" class="ink" style="padding:18px 0 18px 12px;font-family:${FONT};font-size:15px;line-height:21px;font-weight:bold;color:${INK};white-space:nowrap">${price}</td>
          </tr>`;
}

function deliveryHtml(order: ConfirmationOrder, contacts: ConfirmationContacts): { total: string; block: string } {
  const text = (value: string, bold = false) =>
    `<div class="ink" style="${bold ? "padding-top:8px;font-weight:bold;" : ""}font-family:${FONT};font-size:15px;line-height:22px;color:${INK}">${value}</div>`;
  const note = (value: string) =>
    `<div class="mute" style="padding-top:8px;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTE}">${value}</div>`;

  if (order.deliveryMethod === "PICKUP") {
    return {
      total: "самовывоз",
      block: text("Самовывоз со склада", true) + text(esc(contacts.pickupAddress)) + note(esc(contacts.hours)),
    };
  }
  return {
    total: order.carrier ? `оплачивается в&nbsp;${esc(order.carrier)}` : "оплачивается отдельно",
    block:
      text(esc(order.carrier ?? "Транспортная компания"), true) +
      (order.deliveryAddress ? text(esc(order.deliveryAddress)) : "") +
      note("Стоимость доставки оплачивается транспортной компании и&nbsp;в&nbsp;сумму заказа не&nbsp;входит."),
  };
}

function paymentHtml(order: ConfirmationOrder, card: TransferCard | null): string {
  const body = `font-family:${FONT};font-size:14px;line-height:21px;color:${INK}`;
  if (order.payment === "INVOICE" || !card) {
    const invoice = order.payment === "INVOICE";
    return `<tr><td style="padding:18px 20px 6px">${caption(invoice ? "Оплата · счёт" : "Оплата")}</td></tr>
          <tr><td class="ink" style="padding:6px 20px 18px;${body}">${esc(invoice ? INVOICE_TEXT : "Реквизиты для перевода пришлёт менеджер")}.</td></tr>`;
  }
  const steps = cardSteps(card);
  const step = (n: number, content: string, pad = "6px 0") =>
    `<tr>
                <td width="28" valign="top" class="brand" style="padding:${pad};font-family:${FONT};font-size:14px;line-height:21px;font-weight:bold;color:${BRAND}">${n}</td>
                <td valign="top" class="ink" style="padding:${pad};${body}">${content}</td>
              </tr>`;
  const amount = hasPriceOnRequest(order) ? "сумму, которую подтвердит менеджер," : `<b>${rub(order.totalKopecks)}</b>`;
  return `<tr><td style="padding:18px 20px 6px">${caption(`Оплата · ${steps.title}`)}</td></tr>
          <tr><td style="padding:6px 20px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${step(1, esc(steps.open))}
              ${step(2, `Переведите ${amount} на&nbsp;карту:`)}
              <tr>
                <td width="28" style="font-size:0">&nbsp;</td>
                <td style="padding:4px 0 8px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="soft" bgcolor="${SOFT}" style="background:${SOFT};border-radius:10px">
                    <tr><td style="padding:14px 16px">
                      <div class="ink" style="font-family:${MONO};font-size:20px;line-height:24px;font-weight:bold;letter-spacing:1px;color:${INK};white-space:nowrap">${esc(formatCardNumber(card.number))}</div>
                      <div class="mute" style="padding-top:4px;font-family:${FONT};font-size:13px;line-height:18px;color:${MUTE}">Получатель: ${esc(card.holder)}</div>
                    </td></tr>
                  </table>
                </td>
              </tr>
              ${step(3, `В&nbsp;комментарии к&nbsp;переводу укажите номер заказа: <b style="font-family:${MONO};font-size:15px">${order.number}</b>`, "6px 0 18px")}
            </table>
          </td></tr>`;
}

function orderConfirmationHtml(order: ConfirmationOrder, contacts: ConfirmationContacts): string {
  const site = esc(contacts.siteUrl);
  const siteName = esc(contacts.siteUrl.replace(/^https?:\/\//, ""));
  const delivery = deliveryHtml(order, contacts);
  const preheader =
    `Заказ № ${order.number} на ${formatRub(order.totalKopecks)} принят. ` +
    (order.payment === "INVOICE" ? "Подготовим счёт на оплату." : "Менеджер подтвердит наличие и сроки.");
  const mailto = `mailto:${contacts.email}?subject=${encodeURIComponent(`Заказ № ${order.number}`)}`;
  const totalsCell = `font-family:${FONT};font-size:14px;line-height:20px`;
  const priceOnRequest = hasPriceOnRequest(order)
    ? `
          <tr><td colspan="2" align="right" class="mute" style="padding-top:4px;font-family:${FONT};font-size:13px;line-height:19px;color:${MUTE}">без товаров с&nbsp;ценой по&nbsp;запросу</td></tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="ru" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Заказ № ${order.number} принят — Баском</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
@media (max-width:620px){
  .px{padding-left:20px!important;padding-right:20px!important}
  .h1{font-size:24px!important;line-height:30px!important}
  .stack{display:block!important;width:100%!important}
  .stack-gap{padding-top:12px!important;padding-left:0!important}
}
@media (prefers-color-scheme:dark){
  .bg{background:#1b1f23!important}
  .card{background:#23282d!important}
  .soft{background:#2b3137!important}
  .ink{color:#eef0ee!important}
  .mute{color:#aab1b9!important}
  .line{border-color:#353c43!important}
  .brand{color:#3fbf7f!important}
}
a{color:${BRAND}}
</style>
</head>
<body class="bg" style="margin:0;padding:0;background:#eef0ee;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px">${esc(preheader)} &#847; &#847; &#847; &#847; &#847; &#847;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background:#eef0ee">
<tr><td align="center" style="padding:32px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
  <tr><td class="card" bgcolor="#ffffff" style="background:#ffffff;border-radius:16px;overflow:hidden">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">

      <tr><td class="px" style="padding:32px 40px 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="bottom" style="padding-bottom:2px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="#e6f3ec" style="background:#e6f3ec;border-radius:6px;padding:5px 10px;font-family:${MONO};font-size:12px;line-height:14px;font-weight:bold;letter-spacing:1px;color:#006b38;mso-line-height-rule:exactly;white-space:nowrap">ЗАКАЗ № ${order.number}</td>
            </tr></table>
          </td>
          <td align="right" valign="top">
            <a href="${site}" style="text-decoration:none;display:inline-block">
            <table role="presentation" width="168" cellpadding="0" cellspacing="0" border="0">
              <tr><td>
                <table role="presentation" width="168" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td valign="bottom" class="brand" style="font-family:${FONT};font-size:24px;line-height:24px;font-weight:bold;letter-spacing:1px;color:${BRAND};mso-line-height-rule:exactly;white-space:nowrap">БАСКОМ</td>
                  <td valign="bottom" align="right" width="54"><img src="${site}/mail/logo-bus.png" width="54" height="22" alt="" style="display:block;width:54px;height:22px;border:0"></td>
                </tr></table>
              </td></tr>
              <tr><td style="padding-top:4px">
                <table role="presentation" width="168" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td width="118" height="3" bgcolor="${BRAND}" style="font-size:0;line-height:0;background:${BRAND}">&nbsp;</td>
                  <td width="50" height="3" bgcolor="#f39200" style="font-size:0;line-height:0;background:#f39200">&nbsp;</td>
                </tr></table>
              </td></tr>
              <tr><td class="mute" style="padding-top:5px;font-family:${FONT};font-size:8px;line-height:10px;letter-spacing:1px;color:${MUTE};white-space:nowrap;mso-line-height-rule:exactly">КОМПЛЕКТУЮЩИЕ ДЛЯ АВТОБУСОВ</td></tr>
            </table>
            </a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td class="px ink h1" style="padding:14px 40px 0;font-family:${FONT};font-size:28px;line-height:34px;font-weight:bold;color:${INK};mso-line-height-rule:exactly">Заказ принят</td></tr>
      <tr><td class="px mute" style="padding:12px 40px 28px;font-family:${FONT};font-size:16px;line-height:24px;color:${MUTE_2};mso-line-height-rule:exactly">${esc(order.customerName)}, здравствуйте! Мы получили ваш заказ. Менеджер свяжется с&nbsp;вами и&nbsp;подтвердит наличие и&nbsp;сроки.</td></tr>

      <tr><td class="px" style="padding:0 40px 10px">${caption("Состав заказа")}</td></tr>
      <tr><td class="px" style="padding:0 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="line" style="border-top:1px solid ${LINE}">
          ${order.items.map(itemRow).join(`\n          <tr><td colspan="3" class="line" style="border-top:1px solid ${LINE};font-size:0;line-height:0">&nbsp;</td></tr>\n          `)}
        </table>
      </td></tr>

      <tr><td class="px" style="padding:0 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="line" style="border-top:1px solid ${LINE}">
          <tr>
            <td class="mute" style="padding:14px 0 4px;${totalsCell};color:${MUTE}">Товары</td>
            <td align="right" class="ink" style="padding:14px 0 4px;${totalsCell};color:${INK}">${rub(order.totalKopecks)}</td>
          </tr>
          <tr>
            <td class="mute" style="padding:4px 0 14px;${totalsCell};color:${MUTE}">Доставка</td>
            <td align="right" class="mute" style="padding:4px 0 14px;${totalsCell};color:${MUTE}">${delivery.total}</td>
          </tr>
          <tr>
            <td class="ink line" style="border-top:1px solid ${LINE};padding:16px 0 0;font-family:${FONT};font-size:18px;line-height:24px;font-weight:bold;color:${INK}">Итого</td>
            <td align="right" class="ink line" style="border-top:1px solid ${LINE};padding:16px 0 0;font-family:${FONT};font-size:22px;line-height:26px;font-weight:bold;color:${INK};white-space:nowrap">${rub(order.totalKopecks)}</td>
          </tr>${priceOnRequest}
        </table>
      </td></tr>

      <tr><td class="px" style="padding:28px 40px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="soft" bgcolor="${SOFT}" style="background:${SOFT};border-radius:12px">
          <tr><td style="padding:18px 20px">
            ${caption("Доставка")}
            ${delivery.block}
          </td></tr>
        </table>
      </td></tr>

      <tr><td class="px" style="padding:16px 40px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="line" style="border:1px solid ${LINE};border-radius:12px">
          ${paymentHtml(order, contacts.card)}
        </table>
      </td></tr>

      <tr><td class="px" style="padding:32px 40px 36px">
        <div class="ink" style="font-family:${FONT};font-size:16px;line-height:22px;font-weight:bold;color:${INK}">Вопросы по заказу</div>
        <div class="mute" style="padding-top:6px;font-family:${FONT};font-size:14px;line-height:21px;color:${MUTE_2}">Позвоните или ответьте на&nbsp;это письмо — назовите номер заказа ${order.number}.</div>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:18px"><tr>
          <td class="stack" style="padding:0">
            <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${esc(contacts.phoneHref)}" style="height:46px;v-text-anchor:middle;width:220px" arcsize="20%" stroke="f" fillcolor="${BRAND}"><center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${esc(contacts.phone)}</center></v:roundrect><![endif]-->
            <!--[if !mso]><!-->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td bgcolor="${BRAND}" style="background:${BRAND};border-radius:10px"><a href="${esc(contacts.phoneHref)}" style="display:block;padding:13px 22px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;white-space:nowrap">${esc(contacts.phone)}</a></td>
            </tr></table>
            <!--<![endif]-->
          </td>
          <td class="stack stack-gap" style="padding-left:10px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td class="line" style="border:1px solid #d5d9d5;border-radius:10px"><a href="${esc(mailto)}" class="brand" style="display:block;padding:12px 20px;font-family:${FONT};font-size:15px;line-height:20px;font-weight:bold;color:${BRAND};text-decoration:none;white-space:nowrap">${esc(contacts.email)}</a></td>
            </tr></table>
          </td>
        </tr></table>
      </td></tr>

    </table>
  </td></tr>

  <tr><td class="px mute" style="padding:24px 32px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTE}">
    <b class="ink" style="color:${INK}">Баском</b> — комплектующие для микроавтобусов<br>
    <a href="${site}" style="color:${BRAND};text-decoration:none">${siteName}</a> · <a href="mailto:${esc(contacts.email)}" style="color:${BRAND};text-decoration:none">${esc(contacts.email)}</a><br>
    Вы получили это письмо, потому что оформили заказ на&nbsp;${siteName}.
  </td></tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
}
