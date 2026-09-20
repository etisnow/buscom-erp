"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ROLES } from "@/domain/user/role";
import { retryInboxEntry } from "@/server/integrations/site-orders";
import { requireUser } from "@/server/session";

export type RetryResult = { ok: true; message: string } | { ok: false; error: string };

/** «Повторить» для записи со статусом FAILED — разбор того же payload заново. */
export async function retryInboxAction(inboxId: string): Promise<RetryResult> {
  await requireUser(ADMIN_ROLES);

  const result = await retryInboxEntry(inboxId);
  revalidatePath("/admin/integration");

  switch (result.status) {
    case 201:
      return { ok: true, message: `Заказ создан: №${result.orderNumber}` };
    case 200:
      return { ok: true, message: `Заказ уже был создан: №${result.orderNumber}` };
    case 202:
      return { ok: false, error: result.error };
    case 400:
      return { ok: false, error: result.error };
  }
}
