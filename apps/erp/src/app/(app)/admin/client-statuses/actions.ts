"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { clientStatusMappingSchema } from "@buscom/domain/order/client-status";
import { ADMIN_ROLES } from "@buscom/domain/user/role";
import { db } from "@/server/db";
import { saveClientStatusMapping } from "@/server/settings/service";
import { requireUser } from "@/server/session";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";

/** «Администрирование → Статусы для клиента»: обе таблицы соответствия сохраняются разом. */
export async function saveClientStatusesAction(
  input: z.input<typeof clientStatusMappingSchema>,
): Promise<SettingsResult> {
  const user = await requireUser(ADMIN_ROLES);
  const parsed = clientStatusMappingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  // Этапы, которых больше нет (удалены у поставщика), в таблице не копим
  const existing = new Set((await db.supplierStage.findMany({ select: { id: true } })).map((stage) => stage.id));
  const supplierStages = Object.fromEntries(
    Object.entries(parsed.data.supplierStages).filter(([id]) => existing.has(id)),
  );

  await saveClientStatusMapping({ orderStatuses: parsed.data.orderStatuses, supplierStages }, user.id);
  revalidatePath("/admin/client-statuses");
  return { ok: true, message: "Соответствие статусов сохранено — сайт подхватит его сразу" };
}
