-- Запись журнала «Новости платформы»: значки мессенджеров в шапке сайта на телефоне.
INSERT INTO "PlatformNews" ("id", "title", "body", "publishedAt", "updatedAt") VALUES
    ('news_20260930_site_mobile_messengers',
     'Сайт: в шапке на телефоне все три мессенджера',
     'В мобильной версии сайта в шапке раньше была только кнопка Max. Теперь рядом с корзиной видны значки Max, WhatsApp и Telegram — можно написать в любой из них в одно касание, как и в шапке на компьютере.',
     '2026-09-30 17:30:00', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
