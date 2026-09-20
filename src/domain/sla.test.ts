import { describe, expect, it } from "vitest";
import {
  addWorkingMinutes,
  DEFAULT_SLA_MINUTES,
  formatWorkingMinutes,
  slaState,
  WORKING_MINUTES_PER_DAY,
  workingMinutesBetween,
} from "./sla";

/** Московское время в UTC-дате: 2026-09-21 — понедельник. */
function msk(iso: string): Date {
  return new Date(`${iso}+03:00`);
}

describe("workingMinutesBetween", () => {
  it("считает минуты внутри одного рабочего дня", () => {
    expect(workingMinutesBetween(msk("2026-09-21T10:00"), msk("2026-09-21T12:30"))).toBe(150);
  });

  it("обрезает время до начала рабочего дня", () => {
    expect(workingMinutesBetween(msk("2026-09-21T07:00"), msk("2026-09-21T10:00"))).toBe(60);
  });

  it("обрезает время после конца рабочего дня", () => {
    expect(workingMinutesBetween(msk("2026-09-21T17:00"), msk("2026-09-21T23:00"))).toBe(60);
  });

  it("ночь между двумя днями не считается", () => {
    expect(workingMinutesBetween(msk("2026-09-21T17:30"), msk("2026-09-22T09:30"))).toBe(60);
  });

  it("полный рабочий день — 9 часов", () => {
    expect(workingMinutesBetween(msk("2026-09-21T00:00"), msk("2026-09-21T23:59"))).toBe(WORKING_MINUTES_PER_DAY);
  });

  it("выходные не считаются", () => {
    // суббота 26-го и воскресенье 27-го целиком
    expect(workingMinutesBetween(msk("2026-09-26T00:00"), msk("2026-09-28T00:00"))).toBe(0);
  });

  it("заявка вечером пятницы ждёт до утра понедельника", () => {
    expect(workingMinutesBetween(msk("2026-09-25T17:45"), msk("2026-09-28T09:15"))).toBe(30);
  });

  it("неделя целиком — пять рабочих дней", () => {
    expect(workingMinutesBetween(msk("2026-09-21T00:00"), msk("2026-09-28T00:00"))).toBe(5 * WORKING_MINUTES_PER_DAY);
  });

  it("обратный порядок дат даёт ноль", () => {
    expect(workingMinutesBetween(msk("2026-09-21T12:00"), msk("2026-09-21T10:00"))).toBe(0);
  });

  it("одинаковые даты дают ноль", () => {
    expect(workingMinutesBetween(msk("2026-09-21T12:00"), msk("2026-09-21T12:00"))).toBe(0);
  });
});

describe("addWorkingMinutes", () => {
  it("прибавляет минуты внутри дня", () => {
    expect(addWorkingMinutes(msk("2026-09-21T10:00"), 90)).toEqual(msk("2026-09-21T11:30"));
  });

  it("переносит остаток на следующий рабочий день", () => {
    expect(addWorkingMinutes(msk("2026-09-21T17:30"), 60)).toEqual(msk("2026-09-22T09:30"));
  });

  it("старт до начала дня отсчитывается с 09:00", () => {
    expect(addWorkingMinutes(msk("2026-09-21T06:00"), 30)).toEqual(msk("2026-09-21T09:30"));
  });

  it("старт в выходные переносится на понедельник", () => {
    expect(addWorkingMinutes(msk("2026-09-26T12:00"), 30)).toEqual(msk("2026-09-28T09:30"));
  });

  it("рабочий день от утра пятницы истекает вечером той же пятницы", () => {
    // Ровно конец рабочего дня, а не утро понедельника: берём самый ранний подходящий момент.
    expect(addWorkingMinutes(msk("2026-09-25T09:00"), WORKING_MINUTES_PER_DAY)).toEqual(msk("2026-09-25T18:00"));
  });

  it("если минут больше, чем осталось в пятнице, срок уезжает за выходные", () => {
    expect(addWorkingMinutes(msk("2026-09-25T09:00"), WORKING_MINUTES_PER_DAY + 30)).toEqual(msk("2026-09-28T09:30"));
  });

  it("ноль минут не двигает момент внутри рабочего дня", () => {
    expect(addWorkingMinutes(msk("2026-09-21T10:00"), 0)).toEqual(msk("2026-09-21T10:00"));
  });

  it("отрицательный срок — ошибка", () => {
    expect(() => addWorkingMinutes(msk("2026-09-21T10:00"), -5)).toThrow(/неотрицательным/);
  });
});

describe("slaState", () => {
  it("новый заказ в пределах 30 минут не просрочен", () => {
    const state = slaState("NEW", msk("2026-09-21T10:00"), msk("2026-09-21T10:20"));
    expect(state.elapsedMinutes).toBe(20);
    expect(state.slaMinutes).toBe(30);
    expect(state.isOverdue).toBe(false);
    expect(state.overdueMinutes).toBe(0);
  });

  it("новый заказ дольше 30 минут просрочен", () => {
    const state = slaState("NEW", msk("2026-09-21T10:00"), msk("2026-09-21T11:00"));
    expect(state.isOverdue).toBe(true);
    expect(state.overdueMinutes).toBe(30);
  });

  it("ночь не делает заказ просроченным", () => {
    const state = slaState("NEW", msk("2026-09-21T17:50"), msk("2026-09-22T09:05"));
    expect(state.elapsedMinutes).toBe(15);
    expect(state.isOverdue).toBe(false);
  });

  it("у отгруженного заказа SLA не контролируется", () => {
    const state = slaState("SHIPPED", msk("2026-09-01T10:00"), msk("2026-09-21T10:00"));
    expect(state.slaMinutes).toBeNull();
    expect(state.isOverdue).toBe(false);
  });

  it("финальные статусы без SLA", () => {
    expect(DEFAULT_SLA_MINUTES.COMPLETED).toBeNull();
    expect(DEFAULT_SLA_MINUTES.CANCELLED).toBeNull();
  });

  it("сборка просрочена после двух рабочих дней", () => {
    const state = slaState("ASSEMBLY", msk("2026-09-21T09:00"), msk("2026-09-23T10:00"));
    expect(state.slaMinutes).toBe(2 * WORKING_MINUTES_PER_DAY);
    expect(state.isOverdue).toBe(true);
    expect(state.overdueMinutes).toBe(60);
  });
});

describe("formatWorkingMinutes", () => {
  it("минуты", () => {
    expect(formatWorkingMinutes(45)).toBe("45 мин");
  });

  it("часы", () => {
    expect(formatWorkingMinutes(180)).toBe("3 ч");
  });

  it("рабочие дни", () => {
    expect(formatWorkingMinutes(WORKING_MINUTES_PER_DAY)).toBe("1 раб. дн.");
  });

  it("дни и часы", () => {
    expect(formatWorkingMinutes(2 * WORKING_MINUTES_PER_DAY + 120)).toBe("2 раб. дн. 2 ч");
  });
});
