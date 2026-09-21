import { describe, expect, it } from "vitest";
import { assertTransition, availableTransitions, canTransition } from "./status";

describe("статусная модель заказа", () => {
  it("менеджер берёт созданный заказ в работу и выполняет его", () => {
    expect(canTransition("NEW", "IN_PROGRESS", "MANAGER")).toBe(true);
    expect(canTransition("IN_PROGRESS", "COMPLETED", "MANAGER")).toBe(true);
  });

  it("созданный заказ сразу выполненным не становится", () => {
    expect(canTransition("NEW", "COMPLETED", "ADMIN")).toBe(false);
    expect(() => assertTransition({ from: "NEW", to: "COMPLETED", role: "ADMIN" })).toThrow(/не предусмотрен/);
  });

  it("из финальных статусов переходов нет", () => {
    expect(availableTransitions("COMPLETED", "ADMIN")).toEqual([]);
    expect(availableTransitions("CANCELLED", "ADMIN")).toEqual([]);
  });

  it("отмена требует причину", () => {
    expect(() => assertTransition({ from: "NEW", to: "CANCELLED", role: "MANAGER" })).toThrow(/причину/);
    expect(() =>
      assertTransition({ from: "NEW", to: "CANCELLED", role: "MANAGER", cancelReason: "Дубль" }),
    ).not.toThrow();
  });

  it("отмена заказа с оплатой — только руководитель", () => {
    expect(availableTransitions("IN_PROGRESS", "MANAGER", 100_000)).toEqual(["COMPLETED"]);
    expect(canTransition("IN_PROGRESS", "CANCELLED", "HEAD", 100_000)).toBe(true);
    expect(() =>
      assertTransition({
        from: "IN_PROGRESS",
        to: "CANCELLED",
        role: "MANAGER",
        cancelReason: "Передумал",
        paidKopecks: 100_000,
      }),
    ).toThrow(/только руководитель/);
  });

  describe("треки поставщиков", () => {
    const done = { supplierName: "Автокомплект", stageIndex: 2, stagesCount: 3 };
    const halfway = { supplierName: "Сидения-Про", stageIndex: 0, stagesCount: 3 };
    const notStarted = { supplierName: "Люки-М", stageIndex: null, stagesCount: 2 };

    it("в «Выполнен» не пускает, пока хоть один поставщик не прошёл цепочку, и называет его", () => {
      expect(() =>
        assertTransition({
          from: "IN_PROGRESS",
          to: "COMPLETED",
          role: "MANAGER",
          supplierTracks: [done, halfway, notStarted],
        }),
      ).toThrow("Не пройдены этапы поставщиков: «Сидения-Про», «Люки-М»");
    });

    it("все треки на последнем этапе — «Выполнен» разрешён", () => {
      expect(() =>
        assertTransition({ from: "IN_PROGRESS", to: "COMPLETED", role: "MANAGER", supplierTracks: [done] }),
      ).not.toThrow();
    });

    it("отмену треки не держат", () => {
      expect(() =>
        assertTransition({
          from: "IN_PROGRESS",
          to: "CANCELLED",
          role: "MANAGER",
          cancelReason: "Нет у поставщика",
          supplierTracks: [notStarted],
        }),
      ).not.toThrow();
    });
  });
});
