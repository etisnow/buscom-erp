import { describe, expect, it } from "vitest";
import { isDellinCarrier, parseDellinStatusHistory } from "./dellin-status";

const history = (items: unknown[], extra: Record<string, unknown> = {}) => ({
  metadata: { status: 200 },
  data: { statusHistory: { "400267443": items }, ...extra },
});

describe("parseDellinStatusHistory", () => {
  it("берёт последний статус и не считает груз забранным, пока заказ в пути", () => {
    const result = parseDellinStatusHistory(
      history([
        { number: "400267443", state: "inway", stateName: "Груз в пути", stateDate: "2023-01-25T11:10:44.000+03:00" },
        {
          number: "400267443",
          state: "waiting",
          stateName: "Ожидает сдачи на терминал",
          stateDate: "2023-01-12T15:52:40.000+03:00",
        },
      ]),
      "400267443",
    );
    expect(result).toEqual({
      ok: true,
      status: { stateName: "Груз в пути", stateDate: "2023-01-25T11:10:44.000+03:00", pickedUp: false },
    });
  });

  it("finished — груз забран", () => {
    const result = parseDellinStatusHistory(
      history([
        {
          state: "accompanying_documents_return",
          stateName: "Груз выдан. Возврат СД",
          stateDate: "2023-02-01T10:00:00.000+03:00",
        },
        { state: "finished", stateName: "Заказ завершен", stateDate: "2023-02-03T10:00:00.000+03:00" },
      ]),
      "400267443",
    );
    expect(result.ok && result.status.pickedUp).toBe(true);
  });

  it("«Груз выдан. Возврат СД» ещё не завершение заказа", () => {
    const result = parseDellinStatusHistory(
      history([
        {
          state: "accompanying_documents_return",
          stateName: "Груз выдан. Возврат СД",
          stateDate: "2023-02-01T10:00:00.000+03:00",
        },
      ]),
      "400267443",
    );
    expect(result.ok && result.status.pickedUp).toBe(false);
  });

  it("накладная не найдена — текст ДЛ из info", () => {
    const result = parseDellinStatusHistory({ data: { info: [{ number: "1", message: "Заказ не найден" }] } }, "1");
    expect(result).toEqual({ ok: false, error: "Заказ не найден" });
  });

  it("мусор вместо ответа — понятная ошибка", () => {
    expect(parseDellinStatusHistory({ errors: "x" }, "1")).toEqual({
      ok: false,
      error: "ДЛ ответили в неожиданном формате",
    });
  });
});

describe("isDellinCarrier", () => {
  it.each(["Деловые линии", "деловые  Линии", "Dellin", "ДЛ"])("%s — ДЛ", (name) => {
    expect(isDellinCarrier(name)).toBe(true);
  });
  it.each(["СДЭК", "ПЭК", "", null])("%s — не ДЛ", (name) => {
    expect(isDellinCarrier(name)).toBe(false);
  });
});
