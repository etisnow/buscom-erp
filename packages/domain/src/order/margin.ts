/**
 * Маржа заказа: сколько остаётся нам с товаров после закупки.
 *
 * Выручка — сумма товаров за вычетом скидок (на позиции и на заказ). Доставку
 * клиенту не считаем: она транзитная, её отдаём перевозчику. Затраты —
 * стоимость закупки для нас (номинал поставщика + «Экономика цены», снимок в
 * позиции), расходы на заказ у каждого поставщика и комиссия с прибыли тем
 * поставщикам, которые её удерживают.
 *
 * Комиссия с прибыли считается по каждому поставщику отдельно: прибыль по его
 * товарам в заказе (продажа минус стоимость для нас, минус его расходы на заказ,
 * минус его доля скидки на заказ) умножается на его процент. Убыточная позиция
 * уменьшает базу; итог меньше нуля — комиссия 0.
 *
 * Если у позиции не выбран поставщик, её закупка неизвестна, и маржа не
 * считается вовсе: цифра без части затрат была бы завышенной и вводила бы в
 * заблуждение. Вместо неё — сколько позиций мешают.
 */
import { lineTotal } from "./totals";
import { roundToRubles, roundToRublesHalfDown, type Kopecks } from "../money";

export type MarginItemInput = {
  priceKopecks: Kopecks;
  quantity: number;
  discountKopecks?: Kopecks;
  supplierId: string | null;
  /** Стоимость закупки для нас за штуку; null — поставщик не выбран */
  costKopecks: Kopecks | null;
};

export type MarginSupplierInput = {
  supplierId: string;
  name: string;
  /** Снимок расходов на заказ из «Экономики цены» */
  orderCostKopecks: Kopecks;
  /** Снимок комиссии с прибыли, сотые доли процента; 0 — не удерживает */
  profitCommissionHundredths: number;
};

export type MarginInput = {
  items: MarginItemInput[];
  /** Скидка на заказ целиком */
  discountKopecks: Kopecks;
  /** Поставщики заказа — по одному на каждого из позиций */
  suppliers: MarginSupplierInput[];
};

export type SupplierCommission = {
  supplierId: string;
  name: string;
  /** Прибыль по товарам поставщика — база комиссии */
  profitKopecks: Kopecks;
  profitCommissionHundredths: number;
  commissionKopecks: Kopecks;
};

export type OrderMargin =
  | {
      known: true;
      revenueKopecks: Kopecks;
      /** Закупка для нас по позициям и расходы на заказ — без комиссий */
      costKopecks: Kopecks;
      /** Комиссии с прибыли — только поставщики, которые её удерживают */
      commissions: SupplierCommission[];
      commissionKopecks: Kopecks;
      marginKopecks: Kopecks;
      /** Доля маржи в выручке, сотые доли процента; null при нулевой выручке */
      marginPercentHundredths: number | null;
    }
  | { known: false; itemsWithoutCost: number };

/**
 * Доля скидки на заказ, приходящаяся на `part` из `whole`, — пропорционально, до
 * целых рублей. Половина — вверх: большая доля уменьшает прибыль поставщика и его
 * комиссию, то есть остаётся в нашу пользу.
 */
export function discountShare(discountKopecks: Kopecks, part: Kopecks, whole: Kopecks): Kopecks {
  if (whole <= 0 || discountKopecks <= 0) return 0;
  return roundToRubles((discountKopecks * part) / whole);
}

/** Комиссия с прибыли: процент от прибыли, если она есть; до целых рублей, половина — вниз, в нашу пользу. */
export function profitCommission(profitKopecks: Kopecks, hundredths: number): Kopecks {
  if (profitKopecks <= 0 || hundredths <= 0) return 0;
  return roundToRublesHalfDown((profitKopecks * hundredths) / 10_000);
}

export function calculateOrderMargin({ items, discountKopecks, suppliers }: MarginInput): OrderMargin {
  const itemsWithoutCost = items.filter((item) => item.costKopecks === null).length;
  if (itemsWithoutCost > 0) return { known: false, itemsWithoutCost };

  const itemsTotal = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const revenueKopecks = itemsTotal - discountKopecks;
  const orderCosts = suppliers.reduce((sum, supplier) => sum + supplier.orderCostKopecks, 0);
  const costKopecks = items.reduce((sum, item) => sum + (item.costKopecks ?? 0) * item.quantity, 0) + orderCosts;

  const commissions: SupplierCommission[] = suppliers
    .filter((supplier) => supplier.profitCommissionHundredths > 0)
    .map((supplier) => {
      const own = items.filter((item) => item.supplierId === supplier.supplierId);
      const sales = own.reduce((sum, item) => sum + lineTotal(item), 0);
      const purchase = own.reduce((sum, item) => sum + (item.costKopecks ?? 0) * item.quantity, 0);
      const profitKopecks =
        sales - discountShare(discountKopecks, sales, itemsTotal) - purchase - supplier.orderCostKopecks;
      return {
        supplierId: supplier.supplierId,
        name: supplier.name,
        profitKopecks,
        profitCommissionHundredths: supplier.profitCommissionHundredths,
        commissionKopecks: profitCommission(profitKopecks, supplier.profitCommissionHundredths),
      };
    });
  const commissionKopecks = commissions.reduce((sum, row) => sum + row.commissionKopecks, 0);
  const marginKopecks = revenueKopecks - costKopecks - commissionKopecks;

  return {
    known: true,
    revenueKopecks,
    costKopecks,
    commissions,
    commissionKopecks,
    marginKopecks,
    marginPercentHundredths: revenueKopecks > 0 ? Math.round((marginKopecks * 10_000) / revenueKopecks) : null,
  };
}
