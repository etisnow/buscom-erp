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
import { OrderMarginBlock } from "@/components/orders/order-margin";
import { OrderPayments } from "@/components/orders/order-payments";
import { SupplierTracks } from "@/components/orders/supplier-tracks";
import { parseCustomerRequisites } from "@/domain/customer/requisites";
import { toDateInput } from "@/domain/datetime";
import { canEditItems, canReassignManager } from "@/domain/order/editing";
import { calculateOrderMargin } from "@/domain/order/margin";
import { canChangeOrderSource, orderSourceLabel } from "@/domain/order/source";
import { TERMINAL_STATUSES } from "@/domain/order/status";
import { buildSupplierRequest } from "@/domain/order/supplier-request";
import { canManageSupplierDocuments } from "@/domain/order/supplier-document";
import { parseOrderItemOptions } from "@/domain/product/options";
import { hasSupplierAction } from "@/domain/supplier/actions";
import { parsePriceFormula, unitCostFor } from "@/domain/supplier/price-economics";
import { canMoveStages } from "@/domain/supplier/stages";
import { findOrderByNumber } from "@/server/orders/details";
import { listManagers } from "@/server/orders/list";
import { listCategories } from "@/server/products/categories";
import { findProductRows } from "@/server/products/list";
import { canEditCatalog } from "@/server/products/service";
import { getCancelReasons, getCarModels, getCarriers, getOrderSources } from "@/server/settings/service";
import { requirePageUser } from "@/server/session";
import { OrderEmails } from "@/components/emails/order-emails";
import { replySubject, suggestedTemplates } from "@/domain/email/letters";
import {
  clientOrderNumber,
  EMAIL_TEMPLATE_KEYS,
  renderEmailTemplate,
  templateVariables,
} from "@/domain/email/templates";
import { requisitesReady } from "@/domain/settings";
import { listOrderEmails, sentTemplates } from "@/server/emails/service";
import { mailConfigured } from "@/server/mail";
import { getSettings } from "@/server/settings/service";
import { toEmailView } from "@/app/(app)/mail/email-view";
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

  // Товары позиций, поставщики, категории и модели — для правки позиции и карточки товара прямо из заказа.
  const [products, suppliers, categories, carModels, emails, usedTemplates, settings, mailReady] = await Promise.all([
    findProductRows(order.items.map((item) => item.productId).filter((id): id is string => id !== null)),
    listSupplierOptions(),
    listCategories(),
    getCarModels(),
    listOrderEmails(order.id),
    sentTemplates(order.id),
    getSettings(),
    mailConfigured(),
  ]);

  // Шаблоны писем заполняются данными заказа здесь, на сервере; в форме их только правят.
  // Клиент знает заказ с сайта по номеру на сайте — его и подставляем в письма.
  const siteNumber = order.siteNumber;
  const templateVars = templateVariables(
    {
      number: order.number,
      siteNumber,
      customerName: order.customer.contactPerson || order.customer.name,
      totalKopecks: order.totalKopecks,
      paidKopecks: order.paidKopecks,
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
      deliveryAddress: order.deliveryAddress,
      shippedAt: order.shippedAt,
    },
    { name: settings.sellerRequisites.name, phone: settings.sellerRequisites.phone },
  );
  const renderedTemplates = Object.fromEntries(
    EMAIL_TEMPLATE_KEYS.map((key) => [key, renderEmailTemplate(settings.emailTemplates[key], templateVars)]),
  ) as Record<(typeof EMAIL_TEMPLATE_KEYS)[number], { subject: string; body: string }>;
  const lastInbound = emails.findLast((email) => email.direction === "INBOUND");

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
        externalId={order.siteNumber}
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
                purchaseCostKopecks: item.purchaseCostKopecks,
                supplierOptions: (item.product?.suppliers ?? []).map((link) => ({
                  id: link.supplier.id,
                  name: link.supplier.name,
                  purchasePriceKopecks: link.purchasePriceKopecks,
                  costKopecks: unitCostFor(link.purchasePriceKopecks, link.supplier.priceFormula),
                  optionPrices: link.optionPrices,
                  priceFormula: parsePriceFormula(link.supplier.priceFormula),
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
            carModels={carModels}
            canEditCatalog={canEditCatalog(user.role)}
          />

          {order.items.length > 0 ? (
            <OrderMarginBlock
              margin={calculateOrderMargin({
                items: order.items.map((item) => ({
                  priceKopecks: item.priceKopecks,
                  quantity: item.quantity,
                  discountKopecks: item.discountKopecks,
                  supplierId: item.supplierId,
                  // Снимок стоимости для нас; у позиций до «Экономики цены» — номинал
                  costKopecks: item.supplierId ? (item.purchaseCostKopecks ?? item.purchasePriceKopecks) : null,
                })),
                discountKopecks: order.discountKopecks,
                suppliers: order.supplierTracks.map((track) => ({
                  supplierId: track.supplier.id,
                  name: track.supplier.name,
                  orderCostKopecks: track.orderCostKopecks,
                  profitCommissionHundredths: track.profitCommissionHundredths,
                })),
              })}
              orderCostsKopecks={order.supplierTracks.reduce((sum, track) => sum + track.orderCostKopecks, 0)}
            />
          ) : null}

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

          <OrderEmails
            orderId={order.id}
            orderNumber={order.number}
            emails={emails.map(toEmailView)}
            defaultTo={lastInbound?.fromEmail ?? order.customer.email}
            replySubject={
              lastInbound
                ? replySubject(lastInbound.subject)
                : `Заказ №${clientOrderNumber({ number: order.number, siteNumber })}`
            }
            templates={renderedTemplates}
            suggestions={suggestedTemplates(
              {
                totalKopecks: order.totalKopecks,
                paidKopecks: order.paidKopecks,
                trackingNumber: order.trackingNumber,
                customerEmail: order.customer.email ?? lastInbound?.fromEmail ?? null,
              },
              usedTemplates,
            )}
            invoiceAvailable={requisitesReady(settings.sellerRequisites)}
            mailReady={mailReady}
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
              canManageDocuments={canManageSupplierDocuments(order.status, user.role)}
              tracks={order.supplierTracks.map((track) => {
                const enabledActions = track.supplier.enabledActions;
                const document = order.supplierDocuments.find(
                  (item) => item.supplierId === track.supplier.id && item.kind === "SUPPLIER_INVOICE",
                );

                // Текст собирается на сервере: формат один на всех и покрыт тестами.
                // Строится, только если включено действие — незачем считать зря.
                // «Наши цены» — цена продажи за штуку из позиции (до скидки на позицию:
                // скидка задана на строку целиком). Расходов на заказ там нет — это
                // закупочная статья, к нашим ценам не относится.
                const buildRequest = (prices: "purchase" | "ours") =>
                  buildSupplierRequest({
                    orderNumber: order.number,
                    orderCreatedAt: order.createdAt,
                    items: order.items
                      .filter((item) => item.supplierId === track.supplier.id)
                      .map((item) => ({
                        name: item.name,
                        quantity: item.quantity,
                        priceKopecks:
                          prices === "ours"
                            ? item.priceKopecks
                            : // Конечная стоимость с экономикой цены; у позиций без снимка — номинал
                              (item.purchaseCostKopecks ?? item.purchasePriceKopecks),
                        options: parseOrderItemOptions(item.options),
                      })),
                    orderCostKopecks: prices === "ours" ? 0 : track.orderCostKopecks,
                    delivery: {
                      method: order.deliveryMethod,
                      carrier: order.carrier,
                      address: order.deliveryAddress,
                    },
                    customer: {
                      name: order.customer.name,
                      phone: order.customer.phone,
                      inn: order.customer.inn,
                      kpp: order.customer.kpp,
                      requisites: parseCustomerRequisites(order.customer.requisites),
                    },
                  });

                return {
                  supplierId: track.supplier.id,
                  supplierName: track.supplier.name,
                  stageId: track.stageId,
                  stages: track.supplier.stages,
                  enabledActions,
                  requestText: hasSupplierAction(enabledActions, "SUPPLIER_REQUEST") ? buildRequest("purchase") : null,
                  ourPricesRequestText: hasSupplierAction(enabledActions, "SUPPLIER_REQUEST_OUR_PRICES")
                    ? buildRequest("ours")
                    : null,
                  invoiceDocument: document
                    ? { id: document.id, fileName: document.fileName, byteSize: document.byteSize }
                    : null,
                };
              })}
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
            shippedAt={order.shippedAt ? toDateInput(order.shippedAt) : ""}
            cargo={{
              weightGrams: order.cargoWeightGrams,
              lengthCm: order.cargoLengthCm,
              widthCm: order.cargoWidthCm,
              heightCm: order.cargoHeightCm,
            }}
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
