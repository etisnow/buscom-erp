import "server-only";
import { leadSchema } from "@buscom/domain/site/lead";
import { SlidingWindowLimiter } from "@buscom/domain/site/rate-limit";
import { COMPANY, SITE_ORIGIN } from "@/config/company";
import { postToErp } from "@/server/erp";

/**
 * Заявки с сайта уходят письмом на почту компании через ERP (решение владельца
 * 27.09, docs/DECISIONS.md). Лимит — как у заказов: 5 за 10 минут с IP и 60 в час
 * на сайт; засчитываются только заявки, прошедшие проверку формы.
 */
const perIp = new SlidingWindowLimiter(5, 10 * 60 * 1000);
const overall = new SlidingWindowLimiter(60, 60 * 60 * 1000);

export type LeadResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** `path` — страница, где заполнили форму: менеджеру видно, откуда заявка. */
export async function sendLead(formInput: unknown, path: string, ip: string | null): Promise<LeadResult> {
  const lead = leadSchema.safeParse(formInput);
  if (!lead.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of lead.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, error: "Проверьте поля формы", fieldErrors };
  }
  if ((ip && !perIp.take(ip)) || !overall.take("all")) {
    return { ok: false, error: `Слишком много заявок подряд — позвоните нам: ${COMPANY.phone.display}` };
  }
  const failed = { ok: false as const, error: `Не удалось отправить заявку — позвоните нам: ${COMPANY.phone.display}` };
  try {
    const page = new URL(path.startsWith("/") ? path : "/", SITE_ORIGIN).toString();
    const response = await postToErp("/api/integrations/site/lead", { lead: { ...lead.data, consent: true }, page });
    if (response?.ok) return { ok: true };
    if (response) console.error(`[lead] ERP ответила ${response.status}`);
  } catch (error) {
    console.error("[lead] ERP недоступна", error);
  }
  return failed;
}
