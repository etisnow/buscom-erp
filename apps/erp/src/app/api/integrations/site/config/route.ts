import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/server/env";
import { verifySignature } from "@/server/integrations/signature";
import { readSettings } from "@/server/settings/service";

/**
 * Настройки сайта, которые задаются в ERP: пока — ключ Яндекс Карт для карты
 * терминалов в оформлении («Администрирование → Транспортные компании»). Сайт
 * таблицу настроек не читает — там пароли почты, — а спрашивает здесь
 * подписанным запросом и держит ответ в кеше.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-signature"), env.SITE_WEBHOOK_SECRET)) {
    return new NextResponse(null, { status: 401 });
  }
  const { carriers } = await readSettings();
  return NextResponse.json({ yandexMapsApiKey: carriers.yandexMapsApiKey || null });
}
