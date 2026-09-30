import { describe, expect, it } from "vitest";
import { isKitCarrier, parseKitCargoStatus } from "./kit-status";

const step = (code: string, name: string, date: string, time: string) => ({ code, name, date, time });

describe("parseKitCargoStatus", () => {
  it("в пути — последний статус, груз не забран", () => {
    expect(
      parseKitCargoStatus({
        status: [
          step("00", "Новый заказ", "2013-10-04", "08:24:35"),
          step("01", "Груз принят", "2013-10-08", "04:52:11"),
        ],
      }),
    ).toEqual({
      ok: true,
      status: { stateName: "Груз принят", stateDate: "2013-10-08T04:52:11+03:00", pickedUp: false },
    });
  });

  it("«Выдан» — груз забран, время выдачи", () => {
    const result = parseKitCargoStatus({
      status: [
        step("03", "Прибыл", "2013-10-11", "08:42:28"),
        step("F3", "Принят на доставку", "2013-10-12", "13:04:20"),
        step("04", "Выдан", "2013-10-12", "13:04:20"),
      ],
    });
    expect(result).toEqual({
      ok: true,
      status: { stateName: "Выдан", stateDate: "2013-10-12T13:04:20+03:00", pickedUp: true },
    });
  });

  it("плановые сроки F1/F2 не считаются последним статусом", () => {
    const result = parseKitCargoStatus({
      status: [
        step("01", "Груз принят", "2013-10-08", "04:52:11"),
        step("F2", "Плановая дата прибытия", "2013-10-20", "00:00:00"),
      ],
    });
    expect(result.ok && result.status.stateName).toBe("Груз принят");
  });

  it("порядок в ответе не важен", () => {
    const result = parseKitCargoStatus({
      status: [step("03", "Прибыл", "2013-10-11", "08:42:28"), step("01", "Груз принят", "2013-10-08", "04:52:11")],
    });
    expect(result.ok && result.status.stateName).toBe("Прибыл");
  });

  it("пустой список и мусор — ошибки", () => {
    expect(parseKitCargoStatus({ status: [] })).toEqual({ ok: false, error: "КИТ не нашли такой груз" });
    expect(parseKitCargoStatus({ x: 1 })).toEqual({ ok: false, error: "КИТ ответили в неожиданном формате" });
  });
});

describe("isKitCarrier", () => {
  it.each(["КИТ", "кит", "KIT", "КИТ (ГТД)", "ТК КИТ"])("%s — КИТ", (name) => expect(isKitCarrier(name)).toBe(true));
  it.each(["СДЭК", "ПЭК", "Китай-карго", "", null])("%s — не КИТ", (name) => expect(isKitCarrier(name)).toBe(false));
});
