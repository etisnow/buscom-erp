import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderDelivery } from "@/components/orders/order-delivery";
import { OrderHeader } from "@/components/orders/order-header";
import { OrderHistory } from "@/components/orders/order-history";
import { OrderItems } from "@/components/orders/order-items";
import { OrderPayments } from "@/components/orders/order-payments";
import { formatMoscowDate, formatPhone } from "@/domain/datetime";
import { canEditItems, canReassignManager } from "@/domain/order/editing";
import { TERMINAL_STATUSES } from "@/domain/order/status";
import { findOrderByNumber } from "@/server/orders/details";
import { listManagers } from "@/server/orders/list";
import { getCancelReasons } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";

export async function generateMetadata({ params }: PageProps<"/orders/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Заказ №${number} — BusCom ERP` };
}

export default async function OrderPage({ params }: PageProps<"/orders/[number]">) {
  const user = await requirePageUser();
  const { number } = await params;

  const orderNumber = Number(number);
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) notFound();

  const [order, managers, cancelReasons] = await Promise.all([
    findOrderByNumber(orderNumber),
    listManagers(),
    getCancelReasons(),
  ]);
  if (!order) notFound();

  // Склад видит карточку, но не правит состав и цены (PRD).
  const editable = canEditItems(order.status, user.role);
  const isClosed = TERMINAL_STATUSES.includes(order.status);

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/orders"
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />К списку заказов
        </Link>

        {/* Печатные формы открываются в новой вкладке — оттуда их сохраняют или печатают. */}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={`/api/orders/${order.number}/documents/invoice`} target="_blank" rel="noopener">
              <FileText />
              Счёт PDF
            </a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={`/api/orders/${order.number}/documents/packing-list`} target="_blank" rel="noopener">
              <ClipboardList />
              Комплектовочный лист PDF
            </a>
          </Button>
        </div>
      </div>

      <OrderHeader
        orderId={order.id}
        orderNumber={order.number}
        externalId={order.externalId}
        status={order.status}
        totalKopecks={order.totalKopecks}
        paidKopecks={order.paidKopecks}
        createdAt={order.createdAt}
        manager={order.manager}
        managers={managers}
        role={user.role}
        canReassign={canReassignManager(order.status, user.role)}
        cancelReasons={cancelReasons}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <OrderItems
            orderId={order.id}
            orderNumber={order.number}
            initialItems={order.items.map((item) => ({
              productId: item.productId,
              sku: item.sku,
              name: item.name,
              priceKopecks: item.priceKopecks,
              quantity: item.quantity,
              discountKopecks: item.discountKopecks,
            }))}
            initialDiscountKopecks={order.discountKopecks}
            deliveryPriceKopecks={order.deliveryPriceKopecks}
            editable={editable}
          />

          <OrderPayments
            orderId={order.id}
            orderNumber={order.number}
            totalKopecks={order.totalKopecks}
            paidKopecks={order.paidKopecks}
            payments={order.payments.map((payment) => ({
              id: payment.id,
              method: payment.method,
              amountKopecks: payment.amountKopecks,
              paidAt: payment.paidAt,
              reference: payment.reference,
              authorName: payment.createdBy?.name ?? null,
            }))}
            canAdd={user.role !== "WAREHOUSE" && order.status !== "CANCELLED"}
          />

          <OrderHistory
            orderId={order.id}
            orderNumber={order.number}
            events={order.events.map((event) => ({
              id: event.id,
              type: event.type,
              fromStatus: event.fromStatus,
              toStatus: event.toStatus,
              comment: event.comment,
              createdAt: event.createdAt,
              authorName: event.user?.name ?? null,
            }))}
          />
        </div>

        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-2 rounded-lg border p-4">
            <h2 className="font-heading font-medium">Клиент</h2>
            <dl className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Имя</dt>
                <dd className="text-right">{order.customer.name}</dd>
              </div>
              {order.customer.phone ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Телефон</dt>
                  <dd className="text-right">{formatPhone(order.customer.phone)}</dd>
                </div>
              ) : null}
              {order.customer.email ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="text-right break-all">{order.customer.email}</dd>
                </div>
              ) : null}
              {order.customer.inn ? (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">ИНН</dt>
                  <dd className="text-right">{order.customer.inn}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Клиент с</dt>
                <dd className="text-right">{formatMoscowDate(order.customer.createdAt)}</dd>
              </div>
            </dl>
          </section>

          <OrderDelivery
            orderId={order.id}
            orderNumber={order.number}
            deliveryMethod={order.deliveryMethod}
            carrier={order.carrier}
            deliveryAddress={order.deliveryAddress}
            deliveryPriceKopecks={order.deliveryPriceKopecks}
            trackingNumber={order.trackingNumber}
            canEdit={!isClosed}
            canEditPrice={!isClosed && user.role !== "WAREHOUSE"}
          />

          {order.customerComment ? (
            <section className="flex flex-col gap-2 rounded-lg border p-4">
              <h2 className="font-heading font-medium">Комментарий клиента</h2>
              <p className="text-sm whitespace-pre-line">{order.customerComment}</p>
            </section>
          ) : null}

          {order.cancelReason ? (
            <section className="border-destructive/40 flex flex-col gap-2 rounded-lg border p-4">
              <h2 className="font-heading font-medium">Причина отмены</h2>
              <p className="text-sm">{order.cancelReason}</p>
            </section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
