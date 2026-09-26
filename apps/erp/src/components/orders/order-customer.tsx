import Link from "next/link";
import type { ReactNode } from "react";
import { ExternalLink, Mail, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CUSTOMER_TYPE_LABELS } from "@/domain/customer/type";
import { formatMoscowDate, formatPhone } from "@/domain/datetime";
import type { CustomerType } from "@/generated/prisma/enums";

export type OrderCustomerData = {
  id: string;
  type: CustomerType;
  name: string;
  phone: string | null;
  email: string | null;
  inn: string | null;
  kpp: string | null;
  contactPerson: string | null;
  comment: string | null;
  createdAt: Date;
  /** Адреса клиента, адрес по умолчанию — первым */
  addresses: { address: string; isDefault: boolean }[];
  ordersCount: number;
};

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "flex min-w-0 flex-col gap-0.5 sm:col-span-2" : "flex min-w-0 flex-col gap-0.5"}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * В импортированных клиентах комментарий бывает на полэкрана — реквизиты целиком.
 * Длинный сворачиваем до первой строки, короткий показываем как есть.
 */
function ClientComment({ text }: { text: string }) {
  const lines = text.trim().split("\n");
  if (lines.length <= 2 && text.length <= 160) {
    return <span className="whitespace-pre-line">{text}</span>;
  }

  return (
    <details className="group">
      <summary className="cursor-pointer list-none">
        <span className="group-open:hidden">
          {lines[0].length > 120 ? `${lines[0].slice(0, 120)}…` : lines[0]}{" "}
          <span className="text-muted-foreground underline underline-offset-4">показать целиком</span>
        </span>
        <span className="text-muted-foreground hidden underline underline-offset-4 group-open:inline">свернуть</span>
      </summary>
      <p className="mt-1 whitespace-pre-line">{text}</p>
    </details>
  );
}

/**
 * Клиент заказа — сразу под шапкой: с кем говорим и как связаться, видно
 * до позиций. Правится клиент в своей карточке, здесь только показ.
 */
export function OrderCustomer({ customer }: { customer: OrderCustomerData }) {
  const isCompany = customer.type === "COMPANY";
  const [mainAddress, ...otherAddresses] = customer.addresses;

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-heading font-medium">Клиент</h2>
        <Link
          href={`/customers/${customer.id}`}
          className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
        >
          {customer.name}
          <ExternalLink className="text-muted-foreground size-3.5" />
        </Link>
        <Badge variant="secondary" className="font-normal">
          {CUSTOMER_TYPE_LABELS[customer.type]}
        </Badge>
        <span className="text-muted-foreground text-sm md:ml-auto">
          Заказов: {customer.ordersCount} · клиент с {formatMoscowDate(customer.createdAt)}
        </span>
      </div>

      {/* На телефоне связаться — главное, что нужно от этого блока: крупные кнопки сверху.
          «Написать» ведёт к письму из ERP, чтобы оно легло в переписку, а не ушло мимо */}
      {customer.phone || customer.email ? (
        <div className="flex gap-2 md:hidden">
          {customer.phone ? (
            <Button asChild variant="outline" className="flex-1">
              <a href={`tel:${customer.phone}`}>
                <Phone />
                Позвонить
              </a>
            </Button>
          ) : null}
          {customer.email ? (
            <Button asChild variant="outline" className="flex-1">
              <a href="#emails">
                <Mail />
                Написать
              </a>
            </Button>
          ) : null}
        </div>
      ) : null}

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Телефон">
          {customer.phone ? (
            <a href={`tel:${customer.phone}`} className="underline-offset-4 hover:underline">
              {formatPhone(customer.phone)}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Field>

        <Field label="Email">
          {customer.email ? (
            <a href={`mailto:${customer.email}`} className="break-all underline-offset-4 hover:underline">
              {customer.email}
            </a>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Field>

        {isCompany ? (
          <>
            <Field label="Контактное лицо">
              {customer.contactPerson ?? <span className="text-muted-foreground">—</span>}
            </Field>
            <Field label="ИНН / КПП">
              {customer.inn || customer.kpp ? (
                [customer.inn, customer.kpp].filter(Boolean).join(" / ")
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>
          </>
        ) : null}

        <Field label="Адрес" wide>
          {mainAddress ? (
            <>
              {mainAddress.address}
              {otherAddresses.length > 0 ? (
                <span className="text-muted-foreground"> · ещё адресов: {otherAddresses.length}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </Field>

        {customer.comment ? (
          <Field label="Комментарий о клиенте" wide>
            <ClientComment text={customer.comment} />
          </Field>
        ) : null}
      </dl>
    </section>
  );
}
