import { describe, expect, it } from "vitest";
import { holdsReservation, reservationAction } from "./reservation";

describe("holdsReservation", () => {
  it("резерв держится от ожидания оплаты до сборки", () => {
    expect(holdsReservation("AWAITING_PAYMENT")).toBe(true);
    expect(holdsReservation("PAID")).toBe(true);
    expect(holdsReservation("ASSEMBLY")).toBe(true);
  });

  it("новый заказ и заказ в работе резерва не держат", () => {
    expect(holdsReservation("NEW")).toBe(false);
    expect(holdsReservation("IN_PROGRESS")).toBe(false);
  });

  it("после отгрузки резерва нет — товар уже списан", () => {
    expect(holdsReservation("SHIPPED")).toBe(false);
    expect(holdsReservation("COMPLETED")).toBe(false);
    expect(holdsReservation("CANCELLED")).toBe(false);
  });
});

describe("reservationAction", () => {
  it("выход из работы вперёд ставит резерв", () => {
    expect(reservationAction("IN_PROGRESS", "AWAITING_PAYMENT")).toBe("RESERVE");
    expect(reservationAction("IN_PROGRESS", "ASSEMBLY")).toBe("RESERVE");
  });

  it("возврат в работу снимает резерв", () => {
    expect(reservationAction("AWAITING_PAYMENT", "IN_PROGRESS")).toBe("RELEASE");
  });

  it("отмена снимает резерв, если он был", () => {
    expect(reservationAction("AWAITING_PAYMENT", "CANCELLED")).toBe("RELEASE");
    expect(reservationAction("PAID", "CANCELLED")).toBe("RELEASE");
    expect(reservationAction("ASSEMBLY", "CANCELLED")).toBe("RELEASE");
  });

  it("отмена без резерва ничего не меняет", () => {
    expect(reservationAction("NEW", "CANCELLED")).toBe("NONE");
    expect(reservationAction("IN_PROGRESS", "CANCELLED")).toBe("NONE");
  });

  it("отгрузка списывает товар", () => {
    expect(reservationAction("ASSEMBLY", "SHIPPED")).toBe("SHIP");
  });

  it("движение внутри зарезервированных статусов резерв не трогает", () => {
    expect(reservationAction("AWAITING_PAYMENT", "PAID")).toBe("NONE");
    expect(reservationAction("PAID", "ASSEMBLY")).toBe("NONE");
  });

  it("взятие заказа в работу резерва не ставит", () => {
    expect(reservationAction("NEW", "IN_PROGRESS")).toBe("NONE");
  });

  it("завершение после отгрузки остатки не трогает", () => {
    expect(reservationAction("SHIPPED", "COMPLETED")).toBe("NONE");
  });
});
