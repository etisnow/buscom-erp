import { describe, expect, it } from "vitest";
import {
  filterKnownTopics,
  notificationTopicsSchema,
  orderCreatedLetter,
  orderCreatedTopic,
  paymentStatusLetter,
  paymentStatusTopic,
  stageIdFromTopic,
  supplierStageLetter,
  supplierStageTopic,
} from "@/domain/notification/topics";

const ORDER = {
  number: 3021,
  customerName: 'ООО "Ромашка"',
  totalKopecks: 700000,
  url: "https://erp.bus-com.ru/orders/3021",
};

const squash = (text: string) => text.replace(/\s/g, " ");

describe("темы уведомлений", () => {
  it("ключ этапа поставщика разбирается обратно в id этапа", () => {
    expect(stageIdFromTopic(supplierStageTopic("st1"))).toBe("st1");
    expect(stageIdFromTopic(orderCreatedTopic("SITE"))).toBeNull();
    expect(stageIdFromTopic("SUPPLIER_STAGE:")).toBeNull();
  });

  it("оставляет общие темы и существующие этапы, остальное выбрасывает", () => {
    const topics = [
      orderCreatedTopic("MANUAL"),
      orderCreatedTopic("SITE"),
      paymentStatusTopic("PAID"),
      // «Не оплачен» — не тема: вернуться в него заказ не может
      paymentStatusTopic("UNPAID"),
      // Ключи первой версии, до разделения на галочки
      "ORDER_CREATED",
      "PAYMENT_STATUS_CHANGED",
      supplierStageTopic("alive"),
      supplierStageTopic("deleted"),
      "WHATEVER",
    ];

    expect(filterKnownTopics(topics, new Set(["alive"]))).toEqual([
      orderCreatedTopic("MANUAL"),
      orderCreatedTopic("SITE"),
      paymentStatusTopic("PAID"),
      supplierStageTopic("alive"),
    ]);
  });

  it("схема убирает повторы", () => {
    expect(notificationTopicsSchema.parse(["A", "A", "B"])).toEqual(["A", "B"]);
  });
});

describe("письма", () => {
  it("новый заказ: номер, источник, клиент, сумма, оплата и ссылка", () => {
    const letter = orderCreatedLetter({ ...ORDER, sourceLabel: "Сайт", paymentStatus: "UNPAID" });

    expect(letter.subject).toBe("Новый заказ №3021");
    expect(letter.text).toContain("Новый заказ №3021 — Сайт.");
    expect(letter.text).toContain('Клиент: ООО "Ромашка"');
    expect(squash(letter.text)).toContain("Сумма заказа: 7 000 ₽");
    expect(letter.text).toContain("Оплата: Не оплачен");
    expect(letter.text).toContain("https://erp.bus-com.ru/orders/3021");
  });

  it("статус оплаты: откуда, куда и сколько оплачено", () => {
    const letter = paymentStatusLetter({ ...ORDER, from: "PARTIAL", to: "PAID", paidKopecks: 700000 });

    expect(letter.subject).toBe("Заказ №3021: оплата — Оплачен");
    expect(letter.text).toContain("Статус оплаты заказа №3021: Частично → Оплачен.");
    expect(squash(letter.text)).toContain("Оплачено: 7 000 ₽ из 7 000 ₽");
  });

  it("этап поставщика: поставщик и переход; без прежнего этапа — «не начат»", () => {
    const letter = supplierStageLetter({
      ...ORDER,
      supplierName: "Прайд",
      fromStageName: null,
      toStageName: "Заказано",
    });

    expect(letter.subject).toBe("Заказ №3021: Прайд — Заказано");
    expect(letter.text).toContain("Заказ №3021, поставщик Прайд: не начат → Заказано.");
  });
});
