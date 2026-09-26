"use server";

import { revalidatePath } from "next/cache";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { retryInboxEntry } from "@/server/integrations/inbox";
import { describePoll, isMailboxConfigured, pollMailbox } from "@/server/integrations/mailbox";
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

/** «Проверить почту» — внеочередной проход по ящику заказов, не дожидаясь таймера. */
export async function pollMailboxAction(): Promise<RetryResult> {
  await requireUser(ADMIN_ROLES);
  if (!(await isMailboxConfigured())) {
    return { ok: false, error: "Ящик не настроен: заполните «Администрирование → Настройки почты → Входящая почта»" };
  }

  try {
    const summary = await pollMailbox();
    revalidatePath("/admin/integration");
    return { ok: true, message: describePoll(summary) };
  } catch (error) {
    return { ok: false, error: `Не удалось проверить ящик: ${error instanceof Error ? error.message : String(error)}` };
  }
}
