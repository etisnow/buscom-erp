import { describe, expect, it } from "vitest";
import { isPassengerSeat, PASSENGER_SEATS_CATEGORY, showSalonKit } from "./seats";

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
