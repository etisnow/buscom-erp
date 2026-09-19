"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoscowDate } from "@/domain/datetime";
import { formatRub, rublesToKopecks } from "@/domain/money";
import { PAYMENT_STATUS_LABELS, paymentStatus, remainingToPay } from "@/domain/order/payment-status";
import type { PaymentMethod } from "@/generated/prisma/enums";
import { addPaymentAction } from "@/app/(app)/orders/[number]/actions";

const METHOD_LABELS: Record<PaymentMethod, string> = {
  INVOICE: "Счёт (безнал)",
  ONLINE: "Онлайн-оплата",
  CASH: "Наличные",
  COD: "Наложенный платёж",
};

export type PaymentRow = {
  id: string;
  method: PaymentMethod;
  amountKopecks: number;
  paidAt: Date;
  reference: string | null;
  authorName: string | null;
};

/** Сегодняшняя дата в московском поясе — значение по умолчанию для поля «дата оплаты». */
function todayInMoscow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return parts;
}

export function OrderPayments({
  orderId,
  orderNumber,
  totalKopecks,
  paidKopecks,
  payments,
  canAdd,
}: {
  orderId: string;
  orderNumber: number;
  totalKopecks: number;
  paidKopecks: number;
  payments: PaymentRow[];
  canAdd: boolean;
}) {
  const remaining = remainingToPay(totalKopecks, paidKopecks);
  const [method, setMethod] = useState<PaymentMethod>("INVOICE");
  // По умолчанию подставляем остаток к оплате (PRD).
  const [amount, setAmount] = useState((remaining / 100).toFixed(2));
  const [paidAt, setPaidAt] = useState(todayInMoscow());
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    let amountKopecks: number;
    try {
      amountKopecks = rublesToKopecks(amount);
    } catch {
      toast.error("Некорректная сумма");
      return;
    }

    startTransition(async () => {
      const result = await addPaymentAction({
        orderId,
        orderNumber,
        method,
        amountKopecks,
        paidAt,
        reference,
      });
      if (result.ok) {
        toast.success("Оплата отмечена");
        setReference("");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-medium">Оплаты</h2>
        <span className="text-muted-foreground text-sm">
          {PAYMENT_STATUS_LABELS[paymentStatus(totalKopecks, paidKopecks)]} · оплачено {formatRub(paidKopecks)} из{" "}
          {formatRub(totalKopecks)}
          {remaining > 0 ? ` · остаток ${formatRub(remaining)}` : ""}
        </span>
      </div>

      {payments.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {payments.map((payment) => (
            <li key={payment.id} className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{formatRub(payment.amountKopecks)}</span>
              <span className="text-muted-foreground">{METHOD_LABELS[payment.method]}</span>
              <span className="text-muted-foreground">{formatMoscowDate(payment.paidAt)}</span>
              {payment.reference ? <span className="text-muted-foreground">№ {payment.reference}</span> : null}
              {payment.authorName ? (
                <span className="text-muted-foreground text-xs">внёс {payment.authorName}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">Платежей пока нет.</p>
      )}

      {canAdd ? (
        <div className="flex flex-wrap items-end gap-3 border-t pt-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="payment-method">
              Способ
            </Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="payment-method" className="w-44" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((item) => (
                  <SelectItem key={item} value={item}>
                    {METHOD_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="payment-amount">
              Сумма, ₽
            </Label>
            <Input
              id="payment-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="h-8 w-32 text-right"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="payment-date">
              Дата
            </Label>
            <Input
              id="payment-date"
              type="date"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
              className="h-8 w-40"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor="payment-reference">
              № документа
            </Label>
            <Input
              id="payment-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="h-8 w-40"
            />
          </div>

          <Button size="sm" disabled={pending} onClick={submit}>
            Отметить оплату
          </Button>
        </div>
      ) : null}
    </section>
  );
}
