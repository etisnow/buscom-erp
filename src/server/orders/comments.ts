import "server-only";
import { db } from "@/server/db";
import { loadOrder, writeOrderEvent } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/** Внутренний комментарий в ленте заказа. Виден всем ролям, клиенту не показывается. */
export async function addOrderComment(orderId: string, text: string, user: SessionUser): Promise<void> {
  const comment = text.trim();
  if (!comment) {
    throw new Error("Комментарий не может быть пустым");
  }

  await db.$transaction(async (tx) => {
    const order = await loadOrder(tx, orderId);
    await writeOrderEvent(tx, { orderId: order.id, user, type: "COMMENT", comment });
  });
}
