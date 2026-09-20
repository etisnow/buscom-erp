import { NextResponse, type NextRequest } from "next/server";
import { parseCustomerListParams } from "@/app/(app)/customers/params";
import { exportCustomersCsv } from "@/server/customers/export";
import { getSessionUser } from "@/server/session";

/**
 * Выгрузка списка клиентов в CSV. Route handler, а не Server Action: браузер
 * должен получить файл на скачивание. Фильтры — те же параметры URL, что и на
 * экране, поэтому файл повторяет видимый список.
 */
export async function GET(request: NextRequest) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const params = request.nextUrl.searchParams;
  const raw = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));

  // Страница в выгрузке не участвует: в файле весь список, а не одна страница.
  const filters = { ...parseCustomerListParams(raw), page: 1 };
  const { csv, fileName, truncated } = await exportCustomersCsv(filters);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Export-Truncated": truncated ? "1" : "0",
      "Cache-Control": "no-store",
    },
  });
}
