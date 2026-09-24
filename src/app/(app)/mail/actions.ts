"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseAddressList } from "@/domain/email/letters";
import { EMAIL_TEMPLATE_KEYS } from "@/domain/email/templates";
import {
  EmailNotFoundError,
  linkEmailToCustomer,
  markEmailsRead,
  olderCustomerEmails,
  searchCustomersForEmail,
  sendOrderEmail,
} from "@/server/emails/service";
import { MAILBOX_ROLES } from "@/domain/user/role";
import {
  addLetterToCorrespondence,
  MailboxUnavailableError,
  markLetterOpened,
  moveLetter,
  setLetterSeen,
  trashLetter,
} from "@/server/emails/mailbox-browser";
import { ForbiddenError } from "@/server/errors";
import { MailNotConfiguredError } from "@/server/mail";
import { OrderConflictError, OrderNotFoundError } from "@/server/orders/internal";
import { requireUser } from "@/server/session";
import type { EmailView } from "@/components/emails/email-thread";
import { toEmailView } from "@/app/(app)/mail/email-view";

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

export type CustomerOption = { id: string; name: string; email: string | null; phone: string | null };

/** Клиенты для ручной привязки письма: по имени, телефону, email или ИНН. */
export async function searchCustomersAction(query: string): Promise<CustomerOption[]> {
  await requireUser();
  return searchCustomersForEmail(String(query).slice(0, 100));
}

/** Привязать письмо к клиенту — для писем с незнакомого адреса. */
export async function linkEmailToCustomerAction(emailId: string, customerId: string): Promise<MailActionResult> {
  await requireUser();
  if (!emailId || !customerId) return { ok: false, error: "Не выбран клиент" };
  try {
    await linkEmailToCustomer(emailId, customerId);
  } catch (error) {
    const known = errorText(error);
    if (known) return { ok: false, error: known };
    throw error;
  }
  revalidatePath("/mail", "layout");
  revalidatePath(`/customers/${customerId}`);
  return { ok: true };
}

const letterRefSchema = z.object({ folder: z.string().min(1), uid: z.number().int().positive() });

async function mailboxAction(action: () => Promise<unknown>): Promise<MailActionResult> {
  try {
    await action();
  } catch (error) {
    const known = errorText(error);
    if (known) return { ok: false, error: known };
    if (error instanceof MailboxUnavailableError) return { ok: false, error: error.message };
    console.error("[mail] Действие с ящиком не выполнено", error);
    return {
      ok: false,
      error: `Почтовый сервер не выполнил действие: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  revalidatePath("/mail", "layout");
  return { ok: true };
}

export async function setMailboxSeenAction(
  ref: z.input<typeof letterRefSchema>,
  seen: boolean,
): Promise<MailActionResult> {
  await requireUser(MAILBOX_ROLES);
  const parsed = letterRefSchema.safeParse(ref);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return mailboxAction(() => setLetterSeen(parsed.data.folder, parsed.data.uid, seen));
}

export async function moveMailboxLetterAction(
  ref: z.input<typeof letterRefSchema>,
  destination: string,
): Promise<MailActionResult> {
  await requireUser(MAILBOX_ROLES);
  const parsed = letterRefSchema.safeParse(ref);
  if (!parsed.success || !destination) return { ok: false, error: "Не указано, куда переместить" };
  return mailboxAction(() => moveLetter(parsed.data.folder, parsed.data.uid, destination));
}

export async function trashMailboxLetterAction(ref: z.input<typeof letterRefSchema>): Promise<MailActionResult> {
  await requireUser(MAILBOX_ROLES);
  const parsed = letterRefSchema.safeParse(ref);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return mailboxAction(() => trashLetter(parsed.data.folder, parsed.data.uid));
}

export type AddLetterResult = { ok: true; message: string } | { ok: false; error: string };

/** Добавить письмо живого ящика в переписку ERP — клиент определяется сам. */
export async function addMailboxLetterAction(ref: z.input<typeof letterRefSchema>): Promise<AddLetterResult> {
  await requireUser(MAILBOX_ROLES);
  const parsed = letterRefSchema.safeParse(ref);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  let outcome: Awaited<ReturnType<typeof addLetterToCorrespondence>> | null = null;
  const result = await mailboxAction(async () => {
    outcome = await addLetterToCorrespondence(parsed.data.folder, parsed.data.uid);
  });
  if (!result.ok) return result;
  const done = outcome as Awaited<ReturnType<typeof addLetterToCorrespondence>> | null;
  if (done?.status === "exists") return { ok: true, message: "Письмо уже есть в переписке" };
  return {
    ok: true,
    message: done?.customerLinked
      ? "Письмо добавлено в переписку клиента"
      : "Письмо добавлено; клиент не определился — привяжите его в «Почта → Без клиента»",
  };
}

/** Письмо ящика открыли в браузере — пометить прочитанным и обновить счётчики слева. */
export async function markMailboxLetterOpenedAction(ref: z.input<typeof letterRefSchema>): Promise<MailActionResult> {
  await requireUser(MAILBOX_ROLES);
  const parsed = letterRefSchema.safeParse(ref);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };
  return mailboxAction(() => markLetterOpened(parsed.data.folder, parsed.data.uid));
}

/** Подгрузка более старых писем переписки с клиентом — при прокрутке ленты в заказе. */
export async function loadOlderEmailsAction(
  customerId: string,
  before: { sentAt: string; id: string },
): Promise<{ items: EmailView[]; hasMore: boolean }> {
  await requireUser();
  const sentAt = new Date(before.sentAt);
  if (!customerId || !before.id || Number.isNaN(sentAt.getTime())) return { items: [], hasMore: false };
  const result = await olderCustomerEmails(customerId, { sentAt, id: before.id });
  return { items: result.items.map(toEmailView), hasMore: result.hasMore };
}
