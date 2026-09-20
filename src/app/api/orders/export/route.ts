import { NextResponse, type NextRequest } from "next/server";
import { parseOrderListParams } from "@/app/(app)/orders/params";
import { exportOrdersCsv } from "@/server/orders/export";
import { defaultView } from "@/server/orders/list";
import { getSessionUser } from "@/server/session";

/**
 * Выгрузка списка заказов в CSV. Route handler, а не Server Action: браузер
 * должен получить файл на скачивание. Фильтры приходят теми же параметрами URL,
 * что и на экране, поэтому файл повторяет видимый список.
 */
export async function GET(request: NextRequest) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const params = request.nextUrl.searchParams;
  const raw = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));

  // Страница в выгрузке не участвует: файл содержит весь список, а не одну страницу.
  const filters = { ...parseOrderListParams(raw, defaultView()), page: 1 };
  const { csv, fileName, truncated } = await exportOrdersCsv(filters, user);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Export-Truncated": truncated ? "1" : "0",
      "Cache-Control": "no-store",
    },
  });
}
