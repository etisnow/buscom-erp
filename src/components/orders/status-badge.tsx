import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import { PAYMENT_STATUS_LABELS, paymentStatus } from "@/domain/order/payment-status";
import type { OrderStatus } from "@/generated/prisma/enums";

/** Цвета статусов: жёлтый — ждёт менеджера, синий — в работе, зелёный — выполнен, красный — отменён. */
const STATUS_CLASS: Record<OrderStatus, string> = {
  NEW: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  IN_PROGRESS: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  COMPLETED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  CANCELLED: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant="secondary" className={`${STATUS_CLASS[status]} border-0 font-normal`}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PaymentBadge({ totalKopecks, paidKopecks }: { totalKopecks: number; paidKopecks: number }) {
  const status = paymentStatus(totalKopecks, paidKopecks);
  const className =
    status === "PAID" || status === "OVERPAID"
      ? "text-emerald-700 dark:text-emerald-400"
      : status === "PARTIAL"
        ? "text-amber-700 dark:text-amber-400"
        : "text-muted-foreground";

  return <span className={`text-sm ${className}`}>{PAYMENT_STATUS_LABELS[status]}</span>;
}
