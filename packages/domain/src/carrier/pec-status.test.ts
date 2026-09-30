import { describe, expect, it } from "vitest";
import { isPecCarrier, isPecPickedUp, parsePecCargoStatus } from "./pec-status";

const body = (cargoStatus: string, info: Record<string, unknown> = {}) => ({
  cargos: [{ info: { cargoStatus, ...info }, cargo: { code: "780339690775" } }],
});

describe("parsePecCargoStatus", () => {
  it("в пути — не забран, даты нет", () => {
    expect(parsePecCargoStatus(body("В пути", { arrivalDateTime: "2011-03-05T11:15:20" }), "780339690775")).toEqual({
      ok: true,
      status: { stateName: "В пути", stateDate: null, pickedUp: false },
    });
  });

  it("«Выдан получателю» — груз забран, время — получения клиентом (Москва)", () => {
    const result = parsePecCargoStatus(
      body("Выдан получателю", {
        giveOutDateTime: "2011-03-10T09:24:24",
        receivedByClientDateTime: "2011-03-11Т14:01:15",
      }),
      "780339690775",
    );
    expect(result).toEqual({
      ok: true,
      status: { stateName: "Выдан получателю", stateDate: "2011-03-11T14:01:15+03:00", pickedUp: true },
    });
  });

  it("без даты получения берётся дата выдачи, статус строчными буквами выравнивается", () => {
    const result = parsePecCargoStatus(body("выдан", { giveOutDateTime: "2011-03-10T09:24:24" }), "780339690775");
    expect(result).toEqual({
      ok: true,
      status: { stateName: "Выдан", stateDate: "2011-03-10T09:24:24+03:00", pickedUp: true },
    });
  });

  it("ответ без груза — ошибка", () => {
    expect(parsePecCargoStatus({ cargos: [] }, "1")).toEqual({ ok: false, error: "ПЭК не нашли такой груз" });
  });

  it("мусор — понятная ошибка", () => {
    expect(parsePecCargoStatus({ x: 1 }, "1")).toEqual({ ok: false, error: "ПЭК ответили в неожиданном формате" });
  });
});

describe("isPecPickedUp", () => {
  it.each(["Выдан получателю", "Доставлен получателю", "выдан", "Выдан (мест 2 из 2)"])("%s — забран", (status) =>
    expect(isPecPickedUp(status)).toBe(true),
  );
  it.each(["Выдан (мест 1 из 2)", "В пути", "Прибыл", "Выполняется адресная доставка", "Возвращен отправителю"])(
    "%s — не забран",
    (status) => expect(isPecPickedUp(status)).toBe(false),
  );
});

describe("isPecCarrier", () => {
  it.each(["ПЭК", "пэк", "PECOM"])("%s — ПЭК", (name) => expect(isPecCarrier(name)).toBe(true));
  it.each(["СДЭК", "Деловые линии", "", null])("%s — не ПЭК", (name) => expect(isPecCarrier(name)).toBe(false));
});
