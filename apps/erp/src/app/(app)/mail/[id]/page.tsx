import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmailCustomerForm, MarkEmailRead } from "@/components/emails/email-link-form";
import { EmailMessage } from "@/components/emails/email-thread";
import { getEmail } from "@/server/emails/service";
import { requirePageUser } from "@/server/session";
import { toEmailView } from "@/app/(app)/mail/email-view";

export const metadata: Metadata = {
  title: "Письмо — BusCom ERP",
};

/** Письмо из переписки ERP: текст, вложения, клиент. Отвечают из карточки заказа клиента. */
export default async function MailLetterPage({ params }: PageProps<"/mail/[id]">) {
  await requirePageUser();
  const { id } = await params;
  const email = await getEmail(id);
  if (!email) notFound();

  const view = toEmailView(email);

  return (
    <main className="flex max-w-4xl flex-col gap-4">
      <MarkEmailRead id={email.id} unread={view.unread} />
      <Link
        href={email.direction === "OUTBOUND" ? "/mail?view=sent" : email.customer ? "/mail" : "/mail?view=unlinked"}
        className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />К почте
      </Link>

      {email.customer ? (
        <p className="text-muted-foreground text-sm">
          Клиент:{" "}
          <Link href={`/customers/${email.customer.id}`} className="text-foreground hover:underline">
            {email.customer.name}
          </Link>{" "}
          — вся переписка и заказы в его карточке.
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">
          Адрес {email.direction === "INBOUND" ? email.fromEmail : email.toEmails.join(", ")} не найден среди клиентов.
        </p>
      )}

      <EmailMessage email={view} />

      <EmailCustomerForm emailId={email.id} hasCustomer={email.customer !== null} />
    </main>
  );
}
