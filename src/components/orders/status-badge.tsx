import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_LABELS } from "@/domain/order/status";
import { PAYMENT_STATUS_LABELS, paymentStatus } from "@/domain/order/payment-status";
import type { OrderStatus } from "@/generated/prisma/enums";

/** Цвета статусов: серый — ожидание, синий — в работе, зелёный — деньги и отгрузка. */
const STATUS_CLASS: Record<OrderStatus, string> = {
  NEW: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  IN_PROGRESS: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  AWAITING_PAYMENT: "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200",
  PAID: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  SHIPPING: "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-200",
  SHIPPED: "bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-200",
  COMPLETED: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200",
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
