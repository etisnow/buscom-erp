import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderCustomer } from "@/components/orders/order-customer";
import { OrderDelivery } from "@/components/orders/order-delivery";
import { OrderHeader } from "@/components/orders/order-header";
import { OrderHistory } from "@/components/orders/order-history";
import { OrderItems } from "@/components/orders/order-items";
import { OrderPayments } from "@/components/orders/order-payments";
import { SupplierTracks } from "@/components/orders/supplier-tracks";
import { canEditItems, canReassignManager } from "@/domain/order/editing";
import { canChangeOrderSource, orderSourceLabel } from "@/domain/order/source";
import { TERMINAL_STATUSES } from "@/domain/order/status";
import { buildSupplierRequest } from "@/domain/order/supplier-request";
import { parseOrderItemOptions } from "@/domain/product/options";
import { canMoveStages } from "@/domain/supplier/stages";
import { findOrderByNumber } from "@/server/orders/details";
import { listManagers } from "@/server/orders/list";
import { listCategories } from "@/server/products/categories";
import { findProductRows } from "@/server/products/list";
import { canEditCatalog } from "@/server/products/service";
import { getCancelReasons, getCarriers, getOrderSources } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";
import { listSupplierOptions } from "@/server/suppliers/list";

export async function generateMetadata({ params }: PageProps<"/orders/[number]">): Promise<Metadata> {
  const { number } = await params;
  return { title: `Заказ №${number} — BusCom ERP` };
}

export default async function OrderPage({ params }: PageProps<"/orders/[number]">) {
  const user = await requirePageUser();
  const { number } = await params;

  const orderNumber = Number(number);
  if (!Number.isSafeInteger(orderNumber) || orderNumber <= 0) notFound();

  const [order, managers, cancelReasons, orderSources, carriers] = await Promise.all([
    findOrderByNumber(orderNumber),
    listManagers(),
    getCancelReasons(),
    getOrderSources(),
    getCarriers(),
  ]);
  if (!order) notFound();

  // Товары позиций, поставщики и категории — для правки позиции и карточки товара прямо из заказа.
  const [products, suppliers, categories] = await Promise.all([
    findProductRows(order.items.map((item) => item.productId).filter((id): id is string => id !== null)),
    listSupplierOptions(),
    listCategories(),
  ]);

  const editable = canEditItems(order.status, user.role, order.paidKopecks);
  const isClosed = TERMINAL_STATUSES.includes(order.status);

  // Источник меняется только у заказа, заведённого руками. Если его пункт выключили,
  // он всё равно нужен в списке — иначе выпадающий список показал бы пустоту.
  const sourceOptions = canChangeOrderSource(order.source)
    ? order.sourceItem && !orderSources.some((item) => item.id === order.sourceItem?.id)
      ? [order.sourceItem, ...orderSources]
      : orderSources
    : [];

  // Перевозчик заказа мог быть выключен в справочнике после того, как его выбрали.
  // В список его всё равно кладём — иначе сохранение доставки молча стёрло бы значение.
  const carrierOptions = order.carrier && !carriers.includes(order.carrier) ? [order.carrier, ...carriers] : carriers;

  return (
    <main className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/orders"
          className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft className="size-4" />К списку заказов
        </Link>

        {/* Печатная форма открывается в новой вкладке — оттуда её сохраняют или печатают. */}
        <Button asChild variant="outline" size="sm">
          <a href={`/api/orders/${order.number}/documents/invoice`} target="_blank" rel="noopener">
            <FileText />
            Счёт PDF
          </a>
        </Button>
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
        sourceLabel={orderSourceLabel(order.source, order.sourceItem?.name)}
        sourceItemId={order.sourceItemId}
        sources={sourceOptions}
      />

      <OrderCustomer
        customer={{
          id: order.customer.id,
          type: order.customer.type,
          name: order.customer.name,
          phone: order.customer.phone,
          email: order.customer.email,
          inn: order.customer.inn,
          kpp: order.customer.kpp,
          contactPerson: order.customer.contactPerson,
          comment: order.customer.comment,
          createdAt: order.customer.createdAt,
          addresses: order.customer.addresses.map((item) => ({ address: item.address, isDefault: item.isDefault })),
          ordersCount: order.customer._count.orders,
        }}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          <OrderItems
            orderId={order.id}
            orderNumber={order.number}
            initialItems={order.items.map((item) => {
              const options = parseOrderItemOptions(item.options);
              return {
                productId: item.productId,
                sku: item.sku,
                name: item.name,
                priceKopecks: item.priceKopecks,
                quantity: item.quantity,
                discountKopecks: item.discountKopecks,
                supplierId: item.supplierId,
                supplierName: item.supplier?.name ?? null,
                purchasePriceKopecks: item.purchasePriceKopecks,
                supplierOptions: (item.product?.suppliers ?? []).map((link) => ({
                  id: link.supplier.id,
                  name: link.supplier.name,
                  purchasePriceKopecks: link.purchasePriceKopecks,
                })),
                optionValueIds: options.map((option) => option.valueId),
                options,
              };
            })}
            initialDiscountKopecks={order.discountKopecks}
            deliveryPriceKopecks={order.deliveryPriceKopecks}
            editable={editable}
            products={products}
            suppliers={suppliers}
            categories={categories}
            canEditCatalog={canEditCatalog(user.role)}
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
            canAdd={order.status !== "CANCELLED"}
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
          {order.supplierTracks.length > 0 ? (
            <SupplierTracks
              orderId={order.id}
              orderNumber={order.number}
              canMove={canMoveStages(order.status, user.role)}
              tracks={order.supplierTracks.map((track) => ({
                supplierId: track.supplier.id,
                supplierName: track.supplier.name,
                stageId: track.stageId,
                stages: track.supplier.stages,
                // Текст собирается на сервере: формат один на всех и покрыт тестами
                requestText: buildSupplierRequest({
                  orderNumber: order.number,
                  orderCreatedAt: order.createdAt,
                  items: order.items
                    .filter((item) => item.supplierId === track.supplier.id)
                    .map((item) => ({
                      name: item.name,
                      quantity: item.quantity,
                      purchasePriceKopecks: item.purchasePriceKopecks,
                      options: parseOrderItemOptions(item.options),
                    })),
                  delivery: {
                    method: order.deliveryMethod,
                    carrier: order.carrier,
                    address: order.deliveryAddress,
                  },
                  customer: { name: order.customer.name, inn: order.customer.inn, kpp: order.customer.kpp },
                }),
              }))}
            />
          ) : null}

          <OrderDelivery
            orderId={order.id}
            orderNumber={order.number}
            deliveryMethod={order.deliveryMethod}
            carrier={order.carrier}
            deliveryAddress={order.deliveryAddress}
            deliveryPriceKopecks={order.deliveryPriceKopecks}
            trackingNumber={order.trackingNumber}
            carriers={carrierOptions}
            canEdit={!isClosed}
            canEditPrice={!isClosed}
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
