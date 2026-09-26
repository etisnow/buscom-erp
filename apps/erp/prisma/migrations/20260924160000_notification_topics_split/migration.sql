-- Подписки разделены на отдельные галочки (docs/DECISIONS.md, «Уведомления»):
-- «Новый заказ» → вручную / с сайта, «Изменение статуса оплаты» → по статусам.
-- Кто был подписан на общую тему, получает все её части — ничего не теряет.

UPDATE "user"
SET "notificationTopics" = array_remove("notificationTopics", 'ORDER_CREATED') || ARRAY['ORDER_CREATED:MANUAL', 'ORDER_CREATED:SITE']
WHERE 'ORDER_CREATED' = ANY("notificationTopics");

UPDATE "user"
SET "notificationTopics" = array_remove("notificationTopics", 'PAYMENT_STATUS_CHANGED') || ARRAY['PAYMENT_STATUS:PARTIAL', 'PAYMENT_STATUS:PAID', 'PAYMENT_STATUS:OVERPAID']
WHERE 'PAYMENT_STATUS_CHANGED' = ANY("notificationTopics");
