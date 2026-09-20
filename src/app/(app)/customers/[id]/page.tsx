import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerAddresses, CustomerForm, MergeCustomers } from "@/components/customers/customer-card";
import { OrderStatusBadge, PaymentBadge } from "@/components/orders/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMoscowDateTime } from "@/domain/datetime";
import { formatRub } from "@/domain/money";
import { findCustomer } from "@/server/customers/list";
import { canEditCustomers } from "@/server/customers/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Клиент — BusCom ERP",
};

/** Покупки считаются по закрытым сделкам — так же, как в списке клиентов. */
const PURCHASED_STATUSES = ["SHIPPED", "COMPLETED"];

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const user = await requirePageUser();
  const { id } = await params;

  const customer = await findCustomer(id);
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
        {editable ? <MergeCustomers customerId={customer.id} customerName={customer.name} /> : null}
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
            comment: customer.comment,
          }}
          editable={editable}
        />

        <CustomerAddresses
          customerId={customer.id}
          addresses={customer.addresses.map((address) => ({
            id: address.id,
            city: address.city,
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
    </main>
  );
}
