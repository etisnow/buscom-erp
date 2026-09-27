"use server";

import { headers } from "next/headers";
import { clientIp } from "@buscom/domain/site/rate-limit";
import { sendLead } from "@/server/leads";

/** Заявка с формы сайта: проверка и отправка — на сервере (src/server/leads.ts). */
export async function sendLeadAction(form: unknown, path: string) {
  const list = await headers();
  return sendLead(
    form,
    typeof path === "string" ? path.slice(0, 200) : "/",
    clientIp(list.get("x-forwarded-for"), list.get("x-real-ip")),
  );
}
