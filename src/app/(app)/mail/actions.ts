"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAddressList } from "@/domain/email/letters";
import { EMAIL_TEMPLATE_KEYS } from "@/domain/email/templates";
import { EmailNotFoundError, linkEmailToOrder, markEmailsRead, sendOrderEmail } from "@/server/emails/service";
import { ForbiddenError } from "@/server/errors";
import { MailNotConfiguredError } from "@/server/mail";
import { OrderConflictError, OrderNotFoundError } from "@/server/orders/internal";
import { requireUser } from "@/server/session";

export type MailActionResult = { ok: true } | { ok: false; error: string };

function errorText(error: unknown): string | null {
  if (
    error instanceof MailNotConfiguredError ||
    error instanceof OrderConflictError ||
    error instanceof OrderNotFoundError ||
    error instanceof EmailNotFoundError ||
    error instanceof ForbiddenError
  ) {
    return error.message;
  }
  return null;
}

const sendSchema = z.object({
  orderId: z.string().min(1),
  orderNumber: z.number().int().positive(),
  to: z.string().trim().min(1, { error: "Укажите адрес клиента" }),
  subject: z.string().trim().min(1, { error: "Укажите тему письма" }).max(300),
  body: z.string().trim().min(1, { error: "Письмо пустое" }).max(50_000),
  template: z.enum(EMAIL_TEMPLATE_KEYS).nullable(),
  attachInvoice: z.boolean(),
});

export async function sendOrderEmailAction(input: z.input<typeof sendSchema>): Promise<MailActionResult> {
  const user = await requireUser();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  const data = parsed.data;

  const to = parseAddressList(data.to);
  if (to.invalid.length > 0) return { ok: false, error: `Не похоже на адрес: ${to.invalid.join(", ")}` };
  if (to.valid.length === 0) return { ok: false, error: "Укажите адрес клиента" };

  try {
    await sendOrderEmail({
      orderId: data.orderId,
      to: to.valid,
      subject: data.subject,
      body: data.body,
      template: data.template,
      attachInvoice: data.attachInvoice,
      user,
    });
  } catch (error) {
    const known = errorText(error);
    if (known) return { ok: false, error: known };
    // Ошибку почтового сервера показываем как есть: по ней видно, что чинить
    // (неверный пароль, сервер недоступен, адрес отвергнут).
    console.error("[mail] Письмо клиенту не отправлено", error);
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Письмо не отправлено: ${message}` };
  }

  revalidatePath(`/orders/${data.orderNumber}`);
  revalidatePath("/mail", "layout");
  return { ok: true };
}

export async function markEmailsReadAction(ids: string[]): Promise<void> {
  await requireUser();
  const parsed = z.array(z.string().min(1)).max(500).safeParse(ids);
  if (!parsed.success) return;
  await markEmailsRead(parsed.data);
  // Счётчик непрочитанных в меню — в общем layout
  revalidatePath("/", "layout");
}

export async function linkEmailAction(emailId: string, orderNumber: number): Promise<MailActionResult> {
  const user = await requireUser();
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) return { ok: false, error: "Некорректный номер заказа" };
  try {
    await linkEmailToOrder(emailId, orderNumber, user);
  } catch (error) {
    const known = errorText(error);
    if (known) return { ok: false, error: known };
    throw error;
  }
  revalidatePath(`/orders/${orderNumber}`);
  revalidatePath("/mail", "layout");
  return { ok: true };
}
