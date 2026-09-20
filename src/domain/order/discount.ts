/**
 * Лимит скидки менеджера (docs/PRD.md, «Бизнес-правила»):
 * сумма всех скидок заказа (позиции + заказ) ≤ 10% от суммы товаров до скидок.
 * Выше лимита — только HEAD и ADMIN.
 *
 * Процент помечен в PRD как «уточнить», поэтому он здесь один на всю систему:
 * когда появится таблица настроек, значение будет приходить параметром.
 */
import { assertKopecks, formatRub, type Kopecks } from "@/domain/money";
import type { UserRole } from "@/generated/prisma/enums";

export const DEFAULT_DISCOUNT_LIMIT_PERCENT = 10;

/** Роли, которым лимит скидки не писан. */
const UNLIMITED_ROLES: UserRole[] = ["HEAD", "ADMIN"];

export type DiscountItemInput = {
  priceKopecks: Kopecks;
  quantity: number;
  /** Скидка на позицию целиком (не на единицу) */
  discountKopecks?: Kopecks;
};

export type DiscountCheckInput = {
  items: DiscountItemInput[];
  /** Скидка на заказ целиком */
  orderDiscountKopecks?: Kopecks;
  role: UserRole;
  limitPercent?: number;
};

/** Сумма товаров до любых скидок — база, от которой считается лимит. */
export function grossItemsTotal(items: DiscountItemInput[]): Kopecks {
  return items.reduce((sum, item) => {
    assertKopecks(item.priceKopecks);
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Количество должно быть целым положительным числом, получено: ${item.quantity}`);
    }
    return sum + item.priceKopecks * item.quantity;
  }, 0);
}

/** Скидки по позициям плюс скидка на заказ. */
export function totalDiscount(items: DiscountItemInput[], orderDiscountKopecks: Kopecks = 0): Kopecks {
  assertKopecks(orderDiscountKopecks);
  return items.reduce((sum, item) => {
    const discount = item.discountKopecks ?? 0;
    assertKopecks(discount);
    return sum + discount;
  }, orderDiscountKopecks);
}

/** Максимальная скидка в копейках — округляется вниз, чтобы лимит не превышался ни на копейку. */
export function maxDiscountKopecks(
  grossKopecks: Kopecks,
  limitPercent: number = DEFAULT_DISCOUNT_LIMIT_PERCENT,
): Kopecks {
  assertKopecks(grossKopecks);
  if (!Number.isFinite(limitPercent) || limitPercent < 0 || limitPercent > 100) {
    throw new Error(`Лимит скидки должен быть от 0 до 100%, получено: ${limitPercent}`);
  }
  return Math.floor((grossKopecks * limitPercent) / 100);
}

/** Доля скидки в процентах от суммы до скидок. Пустой заказ — 0%. */
export function discountPercent(grossKopecks: Kopecks, discountKopecks: Kopecks): number {
  assertKopecks(grossKopecks);
  assertKopecks(discountKopecks);
  if (grossKopecks === 0) return 0;
  return (discountKopecks / grossKopecks) * 100;
}

export class DiscountLimitError extends Error {
  constructor(
    readonly discountKopecks: Kopecks,
    readonly maxKopecks: Kopecks,
    message: string,
  ) {
    super(message);
    this.name = "DiscountLimitError";
  }
}

/**
 * Проверяет скидку перед сохранением заказа. Вызывается сервером при любой правке
 * позиций или скидки — UI может только заранее показать предупреждение.
 */
export function assertDiscountWithinLimit({
  items,
  orderDiscountKopecks = 0,
  role,
  limitPercent = DEFAULT_DISCOUNT_LIMIT_PERCENT,
}: DiscountCheckInput): void {
  const gross = grossItemsTotal(items);
  const discount = totalDiscount(items, orderDiscountKopecks);

  if (discount < 0) {
    throw new Error("Скидка не может быть отрицательной");
  }
  if (discount > gross) {
    throw new DiscountLimitError(discount, gross, "Скидка больше суммы товаров");
  }
  if (UNLIMITED_ROLES.includes(role)) return;

  const max = maxDiscountKopecks(gross, limitPercent);
  if (discount > max) {
    throw new DiscountLimitError(
      discount,
      max,
      `Скидка ${formatRub(discount)} превышает лимит ${limitPercent}% (${formatRub(max)}). ` +
        "Такую скидку может согласовать только руководитель.",
    );
  }
}
