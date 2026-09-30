import { describe, expect, it } from "vitest";
import {
  autoSeatType,
  isPassengerSeat,
  parseSeatType,
  PASSENGER_SEATS_CATEGORY,
  resolveSeatType,
  showSalonKit,
} from "./seats";

const seat = (name: string, categorySlugs: string[] = ["sidenja", PASSENGER_SEATS_CATEGORY]) => ({
  name,
  categorySlugs,
});

describe("isPassengerSeat", () => {
  it("пассажирские сиденья раздела — да", () => {
    for (const name of ["Сиденье Интурист - Люкс", "Сиденье Антивандальное"]) {
      expect(isPassengerSeat(seat(name))).toBe(true);
    }
  });

  it("водительские, гида, откидные бортовые и кресла — нет", () => {
    for (const name of [
      "Сиденье водителя City",
      "Сиденье Водительское",
      "Сиденье Гида",
      "Сиденье Бортовое",
      "Кресло Люкс (аналог Пульман)",
    ]) {
      expect(isPassengerSeat(seat(name))).toBe(false);
    }
  });

  it("товар другого раздела — нет, даже если похож по названию", () => {
    expect(isPassengerSeat(seat("Сиденье Интурист", ["sidenja", "komplektuyshie-dlya-sidenij"]))).toBe(false);
  });
});

describe("showSalonKit", () => {
  it("настройка товара главнее правила: включён — показать, выключен — скрыть", () => {
    expect(showSalonKit(true, seat("Сиденье водителя City"))).toBe(true);
    expect(showSalonKit(true, seat("Шторка", ["shtorki"]))).toBe(true);
    expect(showSalonKit(false, seat("Сиденье Интурист - Люкс"))).toBe(false);
  });

  it("не задана — автоматически, как у пассажирских сидений", () => {
    expect(showSalonKit(null, seat("Сиденье Интурист - Люкс"))).toBe(true);
    expect(showSalonKit(undefined, seat("Сиденье водителя City"))).toBe(false);
  });
});

describe("тип сиденья", () => {
  it("автоматически: пассажирское, водительское, не сиденье", () => {
    expect(autoSeatType(seat("Сиденье Интурист - Люкс"))).toBe("passenger");
    expect(autoSeatType(seat("Сиденье водителя City"))).toBe("driver");
    expect(autoSeatType(seat("Сиденье Гида"))).toBeNull();
    expect(autoSeatType(seat("Шторка", ["shtorki"]))).toBeNull();
  });

  it("ручная настройка главнее правила", () => {
    expect(resolveSeatType("universal", seat("Сиденье водителя City"))).toBe("universal");
    expect(resolveSeatType("driver", seat("Шторка", ["shtorki"]))).toBe("driver");
    expect(resolveSeatType(null, seat("Сиденье Интурист - Люкс"))).toBe("passenger");
  });

  it("разбирает значение из адреса", () => {
    expect(parseSeatType("universal")).toBe("universal");
    expect(parseSeatType("x")).toBeNull();
    expect(parseSeatType(undefined)).toBeNull();
  });

  it("комплект на салон: тип вручную влияет, если блок не настроен", () => {
    expect(showSalonKit(null, { ...seat("Сиденье водителя City"), seatType: "passenger" })).toBe(true);
    expect(showSalonKit(null, { ...seat("Сиденье Интурист - Люкс"), seatType: "universal" })).toBe(false);
  });
});
