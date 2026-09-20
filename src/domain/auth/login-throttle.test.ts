import { describe, expect, it } from "vitest";
import {
  evaluateFailedLogins,
  FAILED_LOGIN_LIMIT,
  FAILED_LOGIN_WINDOW_MINUTES,
  loginBlockedMessage,
} from "./login-throttle";

const now = new Date("2026-09-20T12:00:00.000Z");

/** Метка времени «minutes минут назад». */
function ago(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

/** count неудач подряд, самая свежая — minutes минут назад, шаг между ними полминуты. */
function attempts(count: number, minutes = 1): Date[] {
  return Array.from({ length: count }, (_, index) => ago(minutes + index * 0.5));
}

describe("evaluateFailedLogins", () => {
  it("без попыток вход открыт, в запасе весь лимит", () => {
    const state = evaluateFailedLogins([], now);
    expect(state).toEqual({ blocked: false, attemptsLeft: FAILED_LOGIN_LIMIT });
  });

  it("на девятой неудаче вход ещё открыт", () => {
    const state = evaluateFailedLogins(attempts(FAILED_LOGIN_LIMIT - 1), now);
    expect(state).toEqual({ blocked: false, attemptsLeft: 1 });
  });

  it("десятая неудача в окне закрывает вход", () => {
    const state = evaluateFailedLogins(attempts(FAILED_LOGIN_LIMIT), now);
    expect(state.blocked).toBe(true);
  });

  it("попытки старше окна не считаются", () => {
    const old = Array.from({ length: FAILED_LOGIN_LIMIT }, () => ago(FAILED_LOGIN_WINDOW_MINUTES + 1));
    expect(evaluateFailedLogins(old, now)).toEqual({ blocked: false, attemptsLeft: FAILED_LOGIN_LIMIT });
  });

  it("попытка ровно на границе окна уже не считается", () => {
    const state = evaluateFailedLogins([ago(FAILED_LOGIN_WINDOW_MINUTES)], now);
    expect(state).toEqual({ blocked: false, attemptsLeft: FAILED_LOGIN_LIMIT });
  });

  it("порядок меток не важен", () => {
    const shuffled = [...attempts(FAILED_LOGIN_LIMIT)].reverse();
    expect(evaluateFailedLogins(shuffled, now).blocked).toBe(true);
  });

  it("блокировка держится 15 минут от десятой с конца неудачи", () => {
    // Десять неудач, самая старая — 5 минут назад: она выйдет из окна через 10 минут.
    const failed = Array.from({ length: FAILED_LOGIN_LIMIT }, (_, index) => ago(5 - index * 0.5));
    const state = evaluateFailedLogins(failed, now);

    expect(state).toMatchObject({ blocked: true, minutesLeft: 10 });
    if (state.blocked) {
      expect(state.until.toISOString()).toBe("2026-09-20T12:10:00.000Z");
    }
  });

  it("каждая новая неудача в окне отодвигает разблокировку", () => {
    // Поэтому сервис и не записывает попытки, пока вход заблокирован
    // (src/server/auth/login-attempts.ts): иначе перебор продлевал бы блокировку сам себе.
    const ten = Array.from({ length: FAILED_LOGIN_LIMIT }, (_, index) => ago(5 - index * 0.5));
    const base = evaluateFailedLogins(ten, now);
    const extra = evaluateFailedLogins([...ten, ago(0.1)], now);

    expect(base.blocked && extra.blocked).toBe(true);
    if (base.blocked && extra.blocked) {
      expect(extra.until.getTime()).toBeGreaterThan(base.until.getTime());
    }
  });

  it("после истечения окна вход открывается снова", () => {
    const failed = attempts(FAILED_LOGIN_LIMIT);
    const later = new Date(now.getTime() + (FAILED_LOGIN_WINDOW_MINUTES + 1) * 60_000);

    expect(evaluateFailedLogins(failed, later)).toEqual({ blocked: false, attemptsLeft: FAILED_LOGIN_LIMIT });
  });

  it("остаток времени округляется вверх и не бывает нулевым", () => {
    const failed = Array.from({ length: FAILED_LOGIN_LIMIT }, () => ago(FAILED_LOGIN_WINDOW_MINUTES - 0.01));
    const state = evaluateFailedLogins(failed, now);

    expect(state).toMatchObject({ blocked: true, minutesLeft: 1 });
  });
});

describe("loginBlockedMessage", () => {
  it("склоняет минуты", () => {
    expect(loginBlockedMessage(1)).toContain("через 1 минуту");
    expect(loginBlockedMessage(3)).toContain("через 3 минуты");
    expect(loginBlockedMessage(15)).toContain("через 15 минут");
  });
});
