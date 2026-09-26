import { NextResponse, type NextRequest } from "next/server";
import { buildInvoice } from "@/server/documents/invoice";
import { renderPdf } from "@/server/documents/pdf";
import { findOrderByNumber } from "@/server/orders/details";
import { getSettings } from "@/server/settings/service";
import { getSessionUser } from "@/server/session";

/**
 * Печатные формы заказа: пока только `invoice` — счёт на оплату.
 * Отдельный route handler, а не Server Action: браузер должен получить файл на скачивание.
 */
export async function GET(_request: NextRequest, { params }: RouteContext<"/api/orders/[number]/documents/[kind]">) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const { number, kind } = await params;
  const orderNumber = Number(number);
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) {
    return NextResponse.json({ error: "Некорректный номер заказа" }, { status: 400 });
  }
  if (kind !== "invoice") {
    return NextResponse.json({ error: "Неизвестный документ" }, { status: 404 });
  }

  const order = await findOrderByNumber(orderNumber);
  if (!order) return NextResponse.json({ error: "Заказ не найден" }, { status: 404 });

  const pdf = await renderPdf(buildInvoice(order, (await getSettings()).sellerRequisites));
  const fileName = `schet-${order.number}.pdf`;

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: открывается во вкладке, оттуда сохраняется — так удобнее проверять перед печатью.
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
