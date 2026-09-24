import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { CustomerAddresses, CustomerForm, DeleteCustomer, MergeCustomers } from "@/components/customers/customer-card";
import { OrderStatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { parseCustomerRequisites } from "@/domain/customer/requisites";
import { formatMoscowDateTime } from "@/domain/datetime";
import { formatRub } from "@/domain/money";
import { findCustomer } from "@/server/customers/list";
import { CUSTOMER_DELETE_ROLES, ORDER_CREATE_ROLES, hasRole } from "@/domain/user/role";
import { canEditCustomers } from "@/server/customers/service";
import { requirePageUser } from "@/server/session";
import { EmailMessage } from "@/components/emails/email-thread";
import { listCustomerEmails } from "@/server/emails/service";
import { toEmailView } from "@/app/(app)/mail/email-view";

export const metadata: Metadata = {
  title: "Клиент — BusCom ERP",
};

/** Покупки считаются по закрытым сделкам — так же, как в списке клиентов. */
const PURCHASED_STATUSES = ["COMPLETED"];

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;

  const [customer, emails] = await Promise.all([findCustomer(id), listCustomerEmails(id)]);
  if (!customer) notFound();

  const editable = canEditCustomers(user.role);
  const purchased = customer.orders
    .filter((order) => PURCHASED_STATUSES.includes(order.status))
    .reduce((sum, order) => sum + order.totalKopecks, 0);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/customers"
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />К списку клиентов
        </Link>
        <div className="flex flex-wrap gap-2">
          {hasRole(user.role, ORDER_CREATE_ROLES) ? (
            <Button size="sm" asChild>
              <Link href={`/orders/new?customerId=${customer.id}`}>
                <Plus />
                Новый заказ
              </Link>
            </Button>
          ) : null}
          {editable ? <MergeCustomers customerId={customer.id} customerName={customer.name} /> : null}
          {hasRole(user.role, CUSTOMER_DELETE_ROLES) ? (
            <DeleteCustomer customerId={customer.id} customerName={customer.name} />
          ) : null}
        </div>
      </div>

      <div>
        <h1 className="font-heading text-xl font-semibold">{customer.name}</h1>
        <p className="text-muted-foreground text-sm">
          Заказов: {customer.orders.length} · куплено на {formatRub(purchased)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <CustomerForm
          customer={{
            id: customer.id,
            type: customer.type,
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            inn: customer.inn,
            kpp: customer.kpp,
            contactPerson: customer.contactPerson,
            passport: customer.passport,
            requisites: parseCustomerRequisites(customer.requisites),
            comment: customer.comment,
          }}
          editable={editable}
        />

        <CustomerAddresses
          customerId={customer.id}
          addresses={customer.addresses.map((address) => ({
            id: address.id,
            address: address.address,
            isDefault: address.isDefault,
          }))}
          editable={editable}
        />
      </div>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">История заказов</h2>

        {customer.orders.length === 0 ? (
          <p className="text-muted-foreground text-sm">Заказов пока не было.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">№</TableHead>
                  <TableHead className="w-40">Дата</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Оплата</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link href={`/orders/${order.number}`} className="underline-offset-4 hover:underline">
                        {order.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatMoscowDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatRub(order.totalKopecks)}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={order.status} />
                    </TableCell>
                    <TableCell>
                      <PaymentBadge totalKopecks={order.totalKopecks} paidKopecks={order.paidKopecks} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <h2 className="font-heading font-medium">
          Переписка
          <span className="text-muted-foreground ml-2 text-sm font-normal">
            {emails.total > emails.items.length
              ? `последние ${emails.items.length} из ${emails.total}`
              : emails.total || ""}
          </span>
        </h2>
        {emails.items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Писем с клиентом нет.</p>
        ) : (
          <div className="flex max-h-[40rem] flex-col gap-2 overflow-y-auto">
            {emails.items.map((email) => (
              <EmailMessage key={email.id} email={toEmailView(email)} showOrder />
            ))}
          </div>
        )}
        <p className="text-muted-foreground text-xs">
          Все письма клиента, свежие сверху, со ссылкой на заказ, если письмо к нему привязано. Написать клиенту — из
          карточки заказа.
        </p>
      </section>
    </main>
  );
}
