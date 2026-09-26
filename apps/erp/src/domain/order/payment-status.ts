/**
 * Статус оплаты заказа (docs/PRD.md, «Бизнес-правила»). В БД не хранится —
 * всегда считается из суммы платежей, чтобы он не мог разойтись с самими платежами.
 */
import { assertKopecks, type Kopecks } from "@/domain/money";

export type PaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "OVERPAID";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  UNPAID: "Не оплачен",
  PARTIAL: "Частично",
  PAID: "Оплачен",
  OVERPAID: "Переплата",
};

export type PaymentInput = {
  amountKopecks: Kopecks;
};

/** Сумма всех платежей заказа. */
export function paidTotal(payments: PaymentInput[]): Kopecks {
  return payments.reduce((sum, payment) => {
    assertKopecks(payment.amountKopecks);
    return sum + payment.amountKopecks;
  }, 0);
}

/**
 * Порядок проверок как в PRD: ноль оплат — всегда «Не оплачен», даже у заказа
 * с нулевым итогом (пустой заказ не считается оплаченным).
 */
export function paymentStatus(totalKopecks: Kopecks, paidKopecks: Kopecks): PaymentStatus {
  assertKopecks(totalKopecks);
  assertKopecks(paidKopecks);
  if (paidKopecks < 0) {
    throw new Error("Сумма оплат не может быть отрицательной");
  }

  if (paidKopecks === 0) return "UNPAID";
  if (paidKopecks < totalKopecks) return "PARTIAL";
  if (paidKopecks === totalKopecks) return "PAID";
  return "OVERPAID";
}

/** Остаток к оплате: подставляется по умолчанию в форму платежа. Переплата даёт 0. */
export function remainingToPay(totalKopecks: Kopecks, paidKopecks: Kopecks): Kopecks {
  assertKopecks(totalKopecks);
  assertKopecks(paidKopecks);
  return Math.max(0, totalKopecks - paidKopecks);
}
