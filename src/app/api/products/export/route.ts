import { NextResponse, type NextRequest } from "next/server";
import { parseProductListParams } from "@/app/(app)/products/params";
import { exportProductsCsv } from "@/server/products/export";
import { getSessionUser } from "@/server/session";

/**
 * Выгрузка каталога в CSV. Route handler, а не Server Action: браузер должен
 * получить файл на скачивание. Фильтры — те же параметры URL, что и на экране.
 */
export async function GET(request: NextRequest) {
  // Маршрут под общей защитой proxy, но сессию проверяем и здесь: файл отдаётся напрямую.
  const user = await getSessionUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const params = request.nextUrl.searchParams;
  const raw = Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)]));

  // Страница в выгрузке не участвует: в файле весь список, а не одна страница.
  const filters = { ...parseProductListParams(raw), page: 1 };
  const { csv, fileName, truncated } = await exportProductsCsv(filters);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "X-Export-Truncated": truncated ? "1" : "0",
      "Cache-Control": "no-store",
    },
  });
}
