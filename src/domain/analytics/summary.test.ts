import { describe, expect, it } from "vitest";
import { resolvePeriod } from "./period";
import { revenueSeries, summarizeCompleted, topProducts, type CompletedOrderInput } from "./summary";

type ItemOverrides = Partial<CompletedOrderInput["items"][number]>;

function item(overrides: ItemOverrides = {}): CompletedOrderInput["items"][number] {
  return {
    productId: "p1",
    sku: "A-1",
    name: "Сиденье",
    priceKopecks: 100_000,
    quantity: 1,
    discountKopecks: 0,
    supplierId: "s1",
    costKopecks: 60_000,
    ...overrides,
  };
}

function order(completedAt: string, items: CompletedOrderInput["items"], extra: Partial<CompletedOrderInput> = {}) {
  const itemsTotal = items.reduce((sum, row) => sum + row.priceKopecks * row.quantity - (row.discountKopecks ?? 0), 0);
  return {
    completedAt: new Date(completedAt),
    totalKopecks: itemsTotal,
    discountKopecks: 0,
    items,
    suppliers: [{ supplierId: "s1", name: "Поставщик", orderCostKopecks: 0, profitCommissionHundredths: 0 }],
    ...extra,
  } satisfies CompletedOrderInput;
}

describe("summarizeCompleted", () => {
  it("выручка, число заказов и средний чек", () => {
    const summary = summarizeCompleted([
      order("2026-09-01T10:00:00Z", [item()]),
      order("2026-09-02T10:00:00Z", [item({ priceKopecks: 200_001 })]),
    ]);
    expect(summary.orders).toBe(2);
    expect(summary.revenueKopecks).toBe(300_001);
    expect(summary.averageKopecks).toBe(150_001);
  });

  it("выручка — итог заказа, с доставкой", () => {
    const summary = summarizeCompleted([order("2026-09-01T10:00:00Z", [item()], { totalKopecks: 150_000 })]);
    expect(summary.revenueKopecks).toBe(150_000);
  });

  it("маржа — только по заказам, где она известна, с долей от их товаров", () => {
    const summary = summarizeCompleted([
      order("2026-09-01T10:00:00Z", [item()]),
      // Архивный заказ: поставщик не выбран — маржа неизвестна
      order("2026-09-02T10:00:00Z", [item({ supplierId: null, costKopecks: null, priceKopecks: 500_000 })]),
    ]);
    expect(summary.margin).toEqual({
      knownOrders: 1,
      marginKopecks: 40_000,
      revenueKopecks: 100_000,
      percentHundredths: 4000,
    });
  });

  it("пусто — без среднего чека и процента маржи", () => {
    const summary = summarizeCompleted([]);
    expect(summary.averageKopecks).toBeNull();
    expect(summary.margin.percentHundredths).toBeNull();
  });
});

describe("topProducts", () => {
  it("группирует по товару, считает штуки, сумму со скидками на позицию и заказы", () => {
    const top = topProducts([
      order("2026-09-01T10:00:00Z", [item({ quantity: 2, discountKopecks: 10_000 }), item({ quantity: 1 })]),
      order("2026-09-05T10:00:00Z", [item({ productId: "p2", sku: "B-1", name: "Стол", priceKopecks: 50_000 })]),
    ]);
    expect(top.map((row) => [row.name, row.quantity, row.revenueKopecks, row.orders])).toEqual([
      ["Сиденье", 3, 290_000, 1],
      ["Стол", 1, 50_000, 1],
    ]);
  });

  it("произвольные позиции — по артикулу и названию; название берётся из свежего заказа", () => {
    const top = topProducts([
      order("2026-09-05T10:00:00Z", [item({ name: "Сиденье новое" })]),
      order("2026-09-01T10:00:00Z", [item({ name: "Сиденье старое" })]),
      order("2026-09-02T10:00:00Z", [item({ productId: null, sku: "", name: "Доставка до ТК", priceKopecks: 1 })]),
    ]);
    expect(top.map((row) => [row.name, row.orders])).toEqual([
      ["Сиденье новое", 2],
      ["Доставка до ТК", 1],
    ]);
  });

  it("не больше лимита", () => {
    const orders = [1, 2, 3].map((n) => order("2026-09-01T10:00:00Z", [item({ productId: `p${n}` })]));
    expect(topProducts(orders, 2)).toHaveLength(2);
  });
});

describe("revenueSeries", () => {
  it("раскладывает по дням периода по Москве, пустые дни — нулями", () => {
    const period = resolvePeriod({ from: "2026-09-01", to: "2026-09-03" }, new Date("2026-09-24T12:00:00Z"));
    const series = revenueSeries(
      [
        // 2 сентября 00:30 МСК — ещё 1-е по UTC
        order("2026-09-01T21:30:00Z", [item()]),
        order("2026-09-02T10:00:00Z", [item()]),
      ],
      period,
    );
    expect(series.map((point) => [point.key, point.orders, point.revenueKopecks])).toEqual([
      ["2026-09-01", 0, 0],
      ["2026-09-02", 2, 200_000],
      ["2026-09-03", 0, 0],
    ]);
  });

  it("всё время — с месяца первого выполненного заказа", () => {
    const period = resolvePeriod({ preset: "all" }, new Date("2026-09-24T12:00:00Z"));
    const series = revenueSeries([order("2026-08-10T10:00:00Z", [item()])], period);
    expect(series.map((point) => point.label)).toEqual(["авг 2026", "сен 2026"]);
  });
});
