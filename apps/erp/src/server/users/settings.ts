import "server-only";
import { filterKnownTopics } from "@buscom/domain/notification/topics";
import { db } from "@/server/db";

export type UserSettings = {
  email: string;
  notificationEmail: string | null;
  notificationTopics: string[];
};

/** Личные настройки сотрудника. Чужие не читаются: id всегда берётся из сессии. */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, notificationEmail: true, notificationTopics: true },
  });
}

/** null — адрес не задан, уведомления пойдут на адрес входа. */
export async function saveNotificationEmail(userId: string, notificationEmail: string | null): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { notificationEmail } });
}

export type SupplierStagesForTopics = {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}[];

/** Поставщики с этапами — из них строятся подписки на этапы. Без этапов подписываться не на что. */
export async function listSupplierStagesForTopics(): Promise<SupplierStagesForTopics> {
  return db.supplier.findMany({
    where: { stages: { some: {} } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      stages: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true } },
    },
  });
}

/** Сохраняет подписки целиком. Неизвестные темы и удалённые этапы отбрасываются. */
export async function saveNotificationTopics(userId: string, topics: string[]): Promise<void> {
  const stages = await db.supplierStage.findMany({ select: { id: true } });
  const known = filterKnownTopics(topics, new Set(stages.map((stage) => stage.id)));
  await db.user.update({ where: { id: userId }, data: { notificationTopics: known } });
}
