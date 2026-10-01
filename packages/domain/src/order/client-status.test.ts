import { describe, expect, it } from "vitest";
import {
  buildClientTimeline,
  clientStatusLabel,
  clientStatusMappingSchema,
  clientStatusOf,
  DEFAULT_CLIENT_STATUS_MAPPING,
  paymentProgress,
  type ClientStatusMapping,
} from "./client-status";

const t = (day: number, hour = 12) => new Date(Date.UTC(2026, 8, day, hour));
const TOTAL = 1_490_000;

/** «Подтверждён» у нас — «в работе»; этапы: «Заказ у поставщика» → Подтверждён, «Отправлено» → Передан в ТК */
const mapping: ClientStatusMapping = {
  orderStatuses: {},
  supplierStages: { confirmed: "CONFIRMED", shipped: "HANDED_TO_CARRIER" },
};

describe("clientStatusLabel", () => {
  it("«Передан в ТК» называет перевозчика, скобки из справочника убирает", () => {
    expect(clientStatusLabel("HANDED_TO_CARRIER", "СДЭК")).toBe("Передан в СДЭК");
    expect(clientStatusLabel("HANDED_TO_CARRIER", "КИТ (GTD)")).toBe("Передан в КИТ");
    expect(clientStatusLabel("HANDED_TO_CARRIER", null)).toBe("Передан в ТК");
    expect(clientStatusLabel("DELIVERED", "СДЭК")).toBe("Получен");
  });
});

describe("clientStatusOf", () => {
  it("без настройки — по умолчанию: создан, в работе, выполнен, отменён", () => {
    const empty = DEFAULT_CLIENT_STATUS_MAPPING;
    expect(clientStatusOf("NEW", [], empty)).toBe("RECEIVED");
    expect(clientStatusOf("IN_PROGRESS", [], empty)).toBe("CONFIRMED");
    expect(clientStatusOf("COMPLETED", [], empty)).toBe("DELIVERED");
    expect(clientStatusOf("CANCELLED", [], empty)).toBe("CANCELLED");
  });

  it("таблица «статус ERP → клиентский» переопределяет умолчание", () => {
    const custom = { orderStatuses: { NEW: "CONFIRMED" as const }, supplierStages: {} };
    expect(clientStatusOf("NEW", [], custom)).toBe("CONFIRMED");
  });

  it("этап поставщика продвигает заказ: «Принят» → «Подтверждён», «в работе» → «Передан в ТК»", () => {
    expect(clientStatusOf("NEW", ["confirmed"], mapping)).toBe("CONFIRMED");
    expect(clientStatusOf("IN_PROGRESS", ["shipped"], mapping)).toBe("HANDED_TO_CARRIER");
  });

  it("при нескольких поставщиках заказ идёт за самым отстающим", () => {
    expect(clientStatusOf("IN_PROGRESS", ["shipped", "confirmed"], mapping)).toBe("CONFIRMED");
    expect(clientStatusOf("IN_PROGRESS", ["shipped", null], mapping)).toBe("CONFIRMED");
    expect(clientStatusOf("IN_PROGRESS", ["shipped", "unknown"], mapping)).toBe("CONFIRMED");
  });

  it("этап не опускает статус ниже основы; «Получен» и «Отменён» от этапов не зависят", () => {
    const low = { orderStatuses: {}, supplierStages: { early: "RECEIVED" as const } };
    expect(clientStatusOf("IN_PROGRESS", ["early"], low)).toBe("CONFIRMED");
    expect(clientStatusOf("COMPLETED", ["confirmed"], mapping)).toBe("DELIVERED");
    expect(clientStatusOf("CANCELLED", ["shipped"], mapping)).toBe("CANCELLED");
  });
});

describe("paymentProgress", () => {
  it("нет платежей — не оплачен", () => {
    expect(paymentProgress(TOTAL, [])).toEqual({ state: "none", at: null, paidKopecks: 0 });
  });

  it("часть суммы — «частично», время — первого платежа", () => {
    const progress = paymentProgress(TOTAL, [
      { paidAt: t(3), amountKopecks: 200_000 },
      { paidAt: t(2), amountKopecks: 100_000 },
    ]);
    expect(progress).toEqual({ state: "partial", at: t(2), paidKopecks: 300_000 });
  });

  it("вся сумма — «оплачен», время — платежа, закрывшего сумму; переплата тоже «оплачен»", () => {
    expect(
      paymentProgress(TOTAL, [
        { paidAt: t(2), amountKopecks: 1_000_000 },
        { paidAt: t(4), amountKopecks: 490_000 },
        { paidAt: t(5), amountKopecks: 10_000 },
      ]),
    ).toEqual({ state: "paid", at: t(4), paidKopecks: 1_500_000 });
  });
});

describe("buildClientTimeline", () => {
  const base = {
    createdAt: t(28, 10),
    totalKopecks: TOTAL,
    mapping,
    carrier: "СДЭК",
  } as const;

  it("шаги с датами по журналу; «Оплачен» стоит между «Подтверждён» и «Передан»; текущий — последний достигнутый", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "IN_PROGRESS",
      suppliers: [{ supplierId: "s1", stageId: "shipped" }],
      events: [
        { kind: "STATUS", at: t(28, 11), toStatus: "IN_PROGRESS" },
        { kind: "STAGE", at: t(30), supplierId: "s1", toStageId: "shipped" },
      ],
      payments: [{ paidAt: t(29), amountKopecks: TOTAL }],
    });
    expect(timeline.current).toBe("HANDED_TO_CARRIER");
    expect(timeline.label).toBe("Передан в СДЭК");
    expect(timeline.steps.map((step) => [step.key, step.state, step.at?.getTime() ?? null])).toEqual([
      ["RECEIVED", "done", t(28, 10).getTime()],
      ["CONFIRMED", "done", t(28, 11).getTime()],
      ["PAID", "done", t(29).getTime()],
      ["HANDED_TO_CARRIER", "current", t(30).getTime()],
      ["DELIVERED", "pending", null],
    ]);
  });

  it("трек-номер переводит заказ в «Передан в ТК», даже если ход заказа ещё не дошёл", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "IN_PROGRESS",
      suppliers: [],
      events: [{ kind: "STATUS", at: t(28, 11), toStatus: "IN_PROGRESS" }],
      payments: [],
      shipped: { at: t(30) },
    });
    expect(timeline.current).toBe("HANDED_TO_CARRIER");
    expect(timeline.label).toBe("Передан в СДЭК");
    expect(timeline.steps.find((step) => step.key === "HANDED_TO_CARRIER")).toMatchObject({
      state: "current",
      at: t(30),
    });
  });

  it("трек-номер не отменяет «Отменён» и не откатывает «Получен»", () => {
    const common = { ...base, suppliers: [], events: [], payments: [], shipped: { at: null } };
    expect(buildClientTimeline({ ...common, orderStatus: "CANCELLED" }).current).toBe("CANCELLED");
    expect(buildClientTimeline({ ...common, orderStatus: "COMPLETED" }).current).toBe("DELIVERED");
  });

  it("оплата показывает правду, даже если заказ ещё не подтверждён", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "NEW",
      suppliers: [],
      events: [],
      payments: [{ paidAt: t(28, 15), amountKopecks: TOTAL }],
    });
    expect(timeline.current).toBe("RECEIVED");
    expect(timeline.steps.map((step) => [step.key, step.state])).toEqual([
      ["RECEIVED", "current"],
      ["CONFIRMED", "pending"],
      ["PAID", "done"],
      ["HANDED_TO_CARRIER", "pending"],
      ["DELIVERED", "pending"],
    ]);
    expect(timeline.steps[2].at).toEqual(t(28, 15));
  });

  it("частичная оплата — «Оплачен частично» с суммой, шаг не считается пройденным", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "IN_PROGRESS",
      suppliers: [],
      events: [{ kind: "STATUS", at: t(28, 11), toStatus: "IN_PROGRESS" }],
      payments: [{ paidAt: t(29), amountKopecks: 500_000 }],
    });
    const paid = timeline.steps.find((step) => step.key === "PAID")!;
    expect(paid).toMatchObject({ label: "Оплачен частично", state: "partial", at: t(29) });
    expect(paid.note).toMatch(/^5\s000\s₽ из 14\s900\s₽$/);
    expect(timeline.current).toBe("CONFIRMED");
  });

  it("без платежей «Оплачен» ожидается — даже у отгруженного заказа", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "IN_PROGRESS",
      suppliers: [{ supplierId: "s1", stageId: "shipped" }],
      events: [],
      payments: [],
    });
    expect(timeline.current).toBe("HANDED_TO_CARRIER");
    expect(timeline.steps.find((step) => step.key === "PAID")).toMatchObject({ state: "pending", at: null });
  });

  it("перевозчик подтвердил выдачу — «Получен» с его временем", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "IN_PROGRESS",
      suppliers: [],
      events: [],
      payments: [],
      delivered: { at: t(5) },
    });
    expect(timeline.current).toBe("DELIVERED");
    expect(timeline.steps.at(-1)).toMatchObject({ key: "DELIVERED", state: "current", at: t(5) });
  });

  it("отменённый заказ: пройденное, оплата (если была) и «Отменён» с датой", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "CANCELLED",
      suppliers: [],
      events: [
        { kind: "STATUS", at: t(29), toStatus: "IN_PROGRESS" },
        { kind: "STATUS", at: t(30), toStatus: "CANCELLED" },
      ],
      payments: [{ paidAt: t(29), amountKopecks: TOTAL }],
    });
    expect(timeline.current).toBe("CANCELLED");
    expect(timeline.steps.map((step) => step.key)).toEqual(["RECEIVED", "CONFIRMED", "PAID", "CANCELLED"]);
    expect(timeline.steps.at(-1)).toMatchObject({ state: "current", at: t(30) });
  });

  it("отменённый без оплаты — шага оплаты нет", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "CANCELLED",
      suppliers: [],
      events: [{ kind: "STATUS", at: t(30), toStatus: "CANCELLED" }],
      payments: [],
    });
    expect(timeline.steps.map((step) => step.key)).toEqual(["RECEIVED", "CANCELLED"]);
  });

  it("заказ без журнала (архивный): шаги хода пройдены, дат нет", () => {
    const timeline = buildClientTimeline({
      ...base,
      orderStatus: "COMPLETED",
      suppliers: [],
      events: [],
      payments: [{ paidAt: t(2), amountKopecks: TOTAL }],
    });
    expect(timeline.current).toBe("DELIVERED");
    expect(timeline.steps.every((step) => step.state !== "pending")).toBe(true);
    expect(timeline.steps.at(-1)!.at).toBeNull();
  });
});

describe("clientStatusMappingSchema", () => {
  it("пустое значение — умолчания; «Оплачен» и мусор в таблицах отвергаются", () => {
    expect(clientStatusMappingSchema.parse({})).toEqual({ orderStatuses: {}, supplierStages: {} });
    expect(clientStatusMappingSchema.safeParse({ supplierStages: { a: "CANCELLED" } }).success).toBe(false);
    expect(clientStatusMappingSchema.safeParse({ supplierStages: { a: "PAID" } }).success).toBe(false);
    expect(clientStatusMappingSchema.safeParse({ orderStatuses: { NEW: "PAID" } }).success).toBe(false);
    expect(clientStatusMappingSchema.safeParse({ orderStatuses: { NEW: "бред" } }).success).toBe(false);
  });
});
