-- Дата доставки заказа: когда груз будет у получателя (из накладной ТК или руками)
ALTER TABLE "Order" ADD COLUMN "deliveryDate" TIMESTAMP(3);
