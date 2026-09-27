import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkInn } from "@buscom/domain/customer/company-lookup";
import { findCompanyByInn } from "@/server/customers/company-lookup";
import { env } from "@/server/env";
import { verifySignature } from "@/server/integrations/signature";

const bodySchema = z.object({ inn: z.string().max(20) });

/**
 * Реквизиты по ИНН для оформления заказа на bus-com.ru (docs/SITE-PRD.md, «04 ·
 * Корзина и оформление»). Ключ DaData живёт только в ERP, сайт спрашивает её
 * подписанным запросом, как и при отправке заказа. Лимит частоты — на стороне
 * сайта, по IP покупателя.
 *
 * Покупателю — только название и КПП и короткий текст ошибки: причины сбоя
 * (ключ, лимит DaData) — в лог ERP, а не на сайт.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-signature"), env.SITE_WEBHOOK_SECRET)) {
    return new NextResponse(null, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "Тело запроса не той формы" }, { status: 400 });
  }

  const inn = checkInn(body.inn);
  if (!inn.ok) return NextResponse.json({ ok: false, error: inn.error });

  const result = await findCompanyByInn(inn.inn);
  if (result.ok) {
    const { name, kpp, status } = result.company;
    return NextResponse.json({ ok: true, company: { name, kpp, active: status === "ACTIVE" || status === "UNKNOWN" } });
  }
  if (result.notFound) {
    return NextResponse.json({ ok: false, error: result.error });
  }
  console.error(`[site/company] ${result.error}`);
  return NextResponse.json({ ok: false, error: "Не удалось найти реквизиты — впишите их вручную" });
}
