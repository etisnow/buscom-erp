"use server";

import { headers } from "next/headers";
import { clientIp } from "@buscom/domain/site/rate-limit";
import { checkOrderStatus } from "@/server/order-status";

/** Проверка статуса заказа с главной: разбор, лимит и запрос в ERP — на сервере (src/server/order-status.ts). */
export async function checkOrderStatusAction(form: unknown) {
  const list = await headers();
  return checkOrderStatus(form, clientIp(list.get("x-forwarded-for"), list.get("x-real-ip")));
}
