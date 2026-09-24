import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Reply } from "lucide-react";
import { EmailLinkForm, MarkEmailRead } from "@/components/emails/email-link-form";
import { EmailMessage } from "@/components/emails/email-thread";
import { Button } from "@/components/ui/button";
import { formatMoscowDate } from "@/domain/datetime";
import { formatRub } from "@/domain/money";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import { getEmail, recentCustomerOrders } from "@/server/emails/service";
import { requirePageUser } from "@/server/session";
import { toEmailView } from "@/app/(app)/mail/email-view";

export const metadata: Metadata = {
  title: "Письмо — BusCom ERP",
};

export default async function MailLetterPage({ params }: PageProps<"/mail/[id]">) {
  await requirePageUser();
  const { id } = await params;
  const email = await getEmail(id);
  if (!email) notFound();

  const view = toEmailView(email);
  // Заказы клиента — быстрый выбор при привязке: обычно письмо про один из последних
  const candidates = email.customer ? await recentCustomerOrders(email.customer.id) : [];

  return (
    <main className="flex max-w-4xl flex-col gap-4">
      <MarkEmailRead id={email.id} unread={view.unread} />
      <div className="flex items-center justify-between gap-3">
        <Link
          href={email.direction === "OUTBOUND" ? "/mail?view=sent" : email.order ? "/mail" : "/mail?view=unlinked"}
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />К почте
        </Link>
        {email.order ? (
          <Button asChild size="sm">
            <Link href={`/orders/${email.order.number}`}>
              <Reply />
              {email.direction === "INBOUND" ? "Ответить в заказе" : "Открыть заказ"} №{email.order.number}
            </Link>
          </Button>
        ) : null}
      </div>

      {email.customer ? (
        <p className="text-muted-foreground text-sm">
          Клиент:{" "}
          <Link href={`/customers/${email.customer.id}`} className="text-foreground hover:underline">
            {email.customer.name}
          </Link>
        </p>
      ) : email.direction === "INBOUND" ? (
        <p className="text-muted-foreground text-sm">Адрес {email.fromEmail} не найден среди клиентов.</p>
      ) : null}

      <EmailMessage email={view} showOrder />

      {email.direction === "INBOUND" ? (
        <EmailLinkForm
          emailId={email.id}
          currentOrderNumber={email.order?.number ?? null}
          candidates={candidates.map((order) => ({
            number: order.number,
            label: `№${order.number} от ${formatMoscowDate(order.createdAt)} · ${ORDER_STATUS_LABELS[order.status]} · ${formatRub(order.totalKopecks)}`,
          }))}
        />
      ) : null}
    </main>
  );
}
