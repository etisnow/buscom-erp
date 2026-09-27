import { describe, expect, it } from "vitest";
import { isPassengerSeat, PASSENGER_SEATS_CATEGORY } from "./seats";

const seat = (name: string, categorySlugs: string[] = ["sidenja", PASSENGER_SEATS_CATEGORY]) => ({
  name,
  categorySlugs,
});

describe("isPassengerSeat", () => {
  it("пассажирские сиденья раздела — да", () => {
    for (const name of ["Сиденье Интурист - Люкс", "Кресло Люкс (аналог Пульман)", "Сиденье Антивандальное"]) {
      expect(isPassengerSeat(seat(name))).toBe(true);
    }
  });

  it("водительские, гида и откидные бортовые — нет", () => {
    for (const name of ["Сиденье водителя City", "Сиденье Водительское", "Сиденье Гида", "Сиденье Бортовое"]) {
      expect(isPassengerSeat(seat(name))).toBe(false);
    }
  });

  it("товар другого раздела — нет, даже если похож по названию", () => {
    expect(isPassengerSeat(seat("Сиденье Интурист", ["sidenja", "komplektuyshie-dlya-sidenij"]))).toBe(false);
  });
});
