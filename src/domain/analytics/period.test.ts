import { describe, expect, it } from "vitest";
import { parseDateInput, toDateInput } from "@/domain/datetime";
import { bucketLabel, bucketStarts, lastDayInclusive, resolvePeriod } from "./period";

// 24.09.2026, 01:30 МСК — в UTC это ещё 23 сентября
const NOW = new Date("2026-09-23T22:30:00Z");

describe("resolvePeriod", () => {
  it("по умолчанию — текущий месяц по Москве, по дням", () => {
    const period = resolvePeriod({}, NOW);
    expect(period.preset).toBe("month");
    expect(period.from?.toISOString()).toBe("2026-08-31T21:00:00.000Z");
    expect(period.to.toISOString()).toBe("2026-09-30T21:00:00.000Z");
    expect(period.bucket).toBe("day");
  });

  it("месяц берётся по Москве, а не по UTC", () => {
    // 1 октября 00:30 МСК — 30 сентября в UTC
    const period = resolvePeriod({ preset: "month" }, new Date("2026-09-30T21:30:00Z"));
    expect(toDateInput(period.from!)).toBe("2026-10-01");
  });

  it("прошлый месяц через границу года", () => {
    const period = resolvePeriod({ preset: "prev-month" }, new Date("2026-01-15T12:00:00Z"));
    expect(toDateInput(period.from!)).toBe("2025-12-01");
    expect(toDateInput(period.to)).toBe("2026-01-01");
  });

  it("три месяца — текущий и два предыдущих целиком, по месяцам", () => {
    const period = resolvePeriod({ preset: "quarter" }, NOW);
    expect(toDateInput(period.from!)).toBe("2026-07-01");
    expect(toDateInput(period.to)).toBe("2026-10-01");
    expect(period.bucket).toBe("month");
  });

  it("год и прошлый год", () => {
    expect(toDateInput(resolvePeriod({ preset: "year" }, NOW).from!)).toBe("2026-01-01");
    const prev = resolvePeriod({ preset: "prev-year" }, NOW);
    expect([toDateInput(prev.from!), toDateInput(prev.to)]).toEqual(["2025-01-01", "2026-01-01"]);
  });

  it("всё время — без нижней границы, до конца сегодняшнего дня", () => {
    const period = resolvePeriod({ preset: "all" }, NOW);
    expect(period.from).toBeNull();
    expect(toDateInput(period.to)).toBe("2026-09-25");
    expect(period.bucket).toBe("month");
  });

  it("неизвестный пресет — месяц по умолчанию", () => {
    expect(resolvePeriod({ preset: "zzz" }, NOW).preset).toBe("month");
  });

  it("даты руками важнее пресета, «по» включительно", () => {
    const period = resolvePeriod({ preset: "year", from: "2026-09-01", to: "2026-09-10" }, NOW);
    expect(period.preset).toBeNull();
    expect(toDateInput(period.from!)).toBe("2026-09-01");
    expect(toDateInput(period.to)).toBe("2026-09-11");
    expect(toDateInput(lastDayInclusive(period.to))).toBe("2026-09-10");
  });

  it("одна дата дополняется: «с» — до сегодня, «по» — с начала её месяца", () => {
    const onlyFrom = resolvePeriod({ from: "2026-09-10" }, NOW);
    expect(toDateInput(onlyFrom.to)).toBe("2026-09-25");
    const onlyTo = resolvePeriod({ to: "2026-08-20" }, NOW);
    expect(toDateInput(onlyTo.from!)).toBe("2026-08-01");
  });

  it("перепутанные даты меняются местами", () => {
    const period = resolvePeriod({ from: "2026-09-10", to: "2026-09-01" }, NOW);
    expect([toDateInput(period.from!), toDateInput(lastDayInclusive(period.to))]).toEqual(["2026-09-01", "2026-09-10"]);
  });

  it("длинный ручной период — по месяцам", () => {
    expect(resolvePeriod({ from: "2026-01-01", to: "2026-06-30" }, NOW).bucket).toBe("month");
  });
});

describe("parseDateInput", () => {
  it("несуществующая дата и мусор — null", () => {
    expect(parseDateInput("2026-02-31")).toBeNull();
    expect(parseDateInput("вчера")).toBeNull();
    expect(parseDateInput(undefined)).toBeNull();
  });
});

describe("bucketStarts", () => {
  it("дни периода, включая пустые", () => {
    const period = resolvePeriod({ from: "2026-09-01", to: "2026-09-03" }, NOW);
    expect(bucketStarts(period, null).map(toDateInput)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });

  it("всё время начинается с месяца первых данных", () => {
    const period = resolvePeriod({ preset: "all" }, NOW);
    const starts = bucketStarts(period, new Date("2026-07-15T10:00:00Z"));
    expect(starts.map(toDateInput)).toEqual(["2026-07-01", "2026-08-01", "2026-09-01"]);
    expect(bucketStarts(period, null)).toEqual([]);
  });

  it("подписи ячеек", () => {
    const start = parseDateInput("2026-09-04")!;
    expect(bucketLabel(start, "month")).toBe("сен 2026");
    expect(bucketLabel(start, "day")).toBe("04.09");
  });
});
