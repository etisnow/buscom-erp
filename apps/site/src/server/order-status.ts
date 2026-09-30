import "server-only";
import {
  clientOrderStatusSchema,
  orderStatusFormSchema,
  type ClientOrderStatus,
} from "@buscom/domain/site/order-status";
import { SlidingWindowLimiter } from "@buscom/domain/site/rate-limit";
import { COMPANY } from "@/config/company";
import { postToErp } from "@/server/erp";

/**
 * «Проверить статус заказа»: сайт спрашивает ERP подписанным запросом по номеру и
 * телефону (src/app/api/integrations/site/order-status в ERP). Перебор номеров
 * ограничен здесь (8 проверок за 10 минут с IP, 120 в час на сайт) и в ERP (по номеру заказа).
 */
const perIp = new SlidingWindowLimiter(8, 10 * 60 * 1000);
const overall = new SlidingWindowLimiter(120, 60 * 60 * 1000);

export type OrderStatusResult =
  { ok: true; status: ClientOrderStatus } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function checkOrderStatus(formInput: unknown, ip: string | null): Promise<OrderStatusResult> {
  const form = orderStatusFormSchema.safeParse(formInput);
  if (!form.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of form.error.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
    return { ok: false, error: "Проверьте номер заказа и телефон", fieldErrors };
  }
  if ((ip && !perIp.take(ip)) || !overall.take("all")) {
    return { ok: false, error: "Слишком много проверок подряд — попробуйте через несколько минут" };
  }

  const unavailable = {
    ok: false as const,
    error: `Сейчас не получается узнать статус — напишите нам в Max, WhatsApp или Telegram: ${COMPANY.max.display}`,
  };
  try {
    // Телефон уходит как ввёл покупатель: нормализует его ERP
    const { phone } = formInput as { phone: string };
    const response = await postToErp("/api/integrations/site/order-status", { number: form.data.number, phone });
    if (!response) return unavailable;
    if (response.status === 404) {
      return {
        ok: false,
        error: "Заказ не найден. Проверьте номер из письма-подтверждения и телефон, который указали при оформлении.",
      };
    }
    if (response.status === 429) {
      return { ok: false, error: "Слишком много проверок этого заказа — попробуйте через несколько минут" };
    }
    if (!response.ok) {
      console.error(`[order-status] ERP ответила ${response.status}`);
      return unavailable;
    }
    return { ok: true, status: clientOrderStatusSchema.parse(await response.json()) };
  } catch (error) {
    console.error("[order-status] ERP недоступна", error);
    return unavailable;
  }
}
