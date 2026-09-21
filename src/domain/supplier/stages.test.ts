import { describe, expect, it } from "vitest";
import {
  assertStageMove,
  canMoveStages,
  incompleteTracks,
  isTrackComplete,
  normalizeStageNames,
  SUPPLIER_STAGES_MAX,
  SupplierStageError,
} from "./stages";

describe("цепочка этапов поставщика", () => {
  it("обрезает пробелы и сохраняет порядок", () => {
    expect(normalizeStageNames(["  Запрошен счёт ", "Оплачено", "Получено"])).toEqual([
      "Запрошен счёт",
      "Оплачено",
      "Получено",
    ]);
  });

  it("пустая цепочка разрешена — у поставщика может не быть своего флоу", () => {
    expect(normalizeStageNames([])).toEqual([]);
  });

  it("пустое название этапа отклоняет", () => {
    expect(() => normalizeStageNames(["Оплачено", "  "])).toThrow(SupplierStageError);
  });

  it("повтор этапа отклоняет без учёта регистра", () => {
    expect(() => normalizeStageNames(["Оплачено", "оплачено"])).toThrow("Этап «оплачено» повторяется");
  });

  it("ограничивает длину цепочки", () => {
    const names = Array.from({ length: SUPPLIER_STAGES_MAX + 1 }, (_, index) => `Этап ${index + 1}`);
    expect(() => normalizeStageNames(names)).toThrow(SupplierStageError);
  });
});

describe("трек поставщика в заказе", () => {
  it("пройден на последнем этапе, а не раньше", () => {
    expect(isTrackComplete({ supplierName: "А", stageIndex: 2, stagesCount: 3 })).toBe(true);
    expect(isTrackComplete({ supplierName: "А", stageIndex: 1, stagesCount: 3 })).toBe(false);
    expect(isTrackComplete({ supplierName: "А", stageIndex: null, stagesCount: 3 })).toBe(false);
  });

  it("поставщик без цепочки заказ не держит", () => {
    expect(isTrackComplete({ supplierName: "А", stageIndex: null, stagesCount: 0 })).toBe(true);
  });

  it("выбирает непройденные треки", () => {
    const tracks = [
      { supplierName: "А", stageIndex: 1, stagesCount: 2 },
      { supplierName: "Б", stageIndex: 0, stagesCount: 2 },
    ];
    expect(incompleteTracks(tracks).map((track) => track.supplierName)).toEqual(["Б"]);
  });
});

describe("смена этапа", () => {
  const base = { orderStatus: "IN_PROGRESS" as const, role: "MANAGER" as const, stagesCount: 3 };

  it("шаг вперёд из «не начат» на первый этап и дальше", () => {
    expect(() => assertStageMove({ ...base, fromIndex: null, toIndex: 0 })).not.toThrow();
    expect(() => assertStageMove({ ...base, fromIndex: 0, toIndex: 1 })).not.toThrow();
  });

  it("шаг назад разрешён — чтобы поправить ошибку, в том числе обратно в «не начат»", () => {
    expect(() => assertStageMove({ ...base, fromIndex: 2, toIndex: 1 })).not.toThrow();
    expect(() => assertStageMove({ ...base, fromIndex: 0, toIndex: null })).not.toThrow();
  });

  it("перепрыгнуть через этап нельзя", () => {
    expect(() => assertStageMove({ ...base, fromIndex: null, toIndex: 2 })).toThrow(/по порядку/);
    expect(() => assertStageMove({ ...base, fromIndex: 1, toIndex: 1 })).toThrow(/по порядку/);
  });

  it("этапа за пределами цепочки нет", () => {
    expect(() => assertStageMove({ ...base, fromIndex: 2, toIndex: 3 })).toThrow(/нет/);
  });

  it("вне работы заказа этапы не двигаются", () => {
    expect(() => assertStageMove({ ...base, orderStatus: "NEW", fromIndex: null, toIndex: 0 })).toThrow(
      /пока заказ в работе/,
    );
    expect(() => assertStageMove({ ...base, orderStatus: "SHIPPING", fromIndex: 1, toIndex: 2 })).toThrow(
      SupplierStageError,
    );
    expect(canMoveStages("PAID", "MANAGER")).toBe(true);
    expect(canMoveStages("COMPLETED", "ADMIN")).toBe(false);
  });
});
