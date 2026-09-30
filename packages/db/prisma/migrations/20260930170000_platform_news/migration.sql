-- CreateTable
CREATE TABLE "PlatformNews" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformNewsRead" (
    "newsId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformNewsRead_pkey" PRIMARY KEY ("newsId","userId")
);

-- CreateIndex
CREATE INDEX "PlatformNews_publishedAt_idx" ON "PlatformNews"("publishedAt");

-- CreateIndex
CREATE INDEX "PlatformNewsRead_userId_idx" ON "PlatformNewsRead"("userId");

-- AddForeignKey
ALTER TABLE "PlatformNews" ADD CONSTRAINT "PlatformNews_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformNewsRead" ADD CONSTRAINT "PlatformNewsRead_newsId_fkey" FOREIGN KEY ("newsId") REFERENCES "PlatformNews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformNewsRead" ADD CONSTRAINT "PlatformNewsRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Первые записи журнала — о том, что вышло вместе с ним (30.09.2026). Время идёт вниз от самой
-- новой записи, чтобы в ленте они лежали в этом же порядке.
INSERT INTO "PlatformNews" ("id", "title", "body", "publishedAt", "updatedAt") VALUES
    ('news_20260930_journal',
     'Новости платформы',
     'Здесь мы ведём журнал новых возможностей ERP и сайта. Новые записи отмечены значком «Новое», а число непрочитанных видно в меню слева. Записи читают все сотрудники, ведёт их администратор.',
     '2026-09-30 12:00:00', CURRENT_TIMESTAMP),
    ('news_20260930_salon_layouts',
     'Схемы салонов в справочниках',
     'В «Справочниках и настройках» появился раздел «Схемы салонов»: схемы на 14, 15, 16, 17 и 18 мест с чертежами из окна «Посчитать комплект» на сайте.

Для каждой схемы задаются число мест, подлокотников и откидных спинок — по ним потом будет считаться цена комплекта пассажирского сиденья. Чертёж открывается на весь экран по клику.',
     '2026-09-30 11:50:00', CURRENT_TIMESTAMP),
    ('news_20260930_lightbox',
     'Просмотр картинок на весь экран',
     'Картинки товаров, снимки при импорте, вложения чата и чертежи схем салонов открываются поверх страницы, а не в новой вкладке.

Листать можно стрелками ← →, кнопками по бокам или свайпом, закрыть — клавишей Esc или щелчком по фону.',
     '2026-09-30 11:40:00', CURRENT_TIMESTAMP),
    ('news_20260930_chat_reactions',
     'Эмодзи и реакции в чате',
     'В поле ввода чата появилась кнопка с эмодзи.

К любому сообщению можно поставить реакцию: кнопка со смайликом рядом с «…». Повторное нажатие снимает реакцию, а если навести на неё курсор, видно, кто её поставил.',
     '2026-09-30 11:30:00', CURRENT_TIMESTAMP),
    ('news_20260930_chat_links',
     'Ссылки в чате кликабельны',
     'Адреса вида https://…, http://… и www.… в сообщениях чата теперь ссылки и открываются в новой вкладке. Номера заказов вида №3021 по-прежнему ведут на карточку заказа.',
     '2026-09-30 11:20:00', CURRENT_TIMESTAMP),
    ('news_20260930_image_processing',
     'Удалить водяной знак и фон у картинки товара',
     'В карточке товара у каждой картинки галереи появилась кнопка с волшебной палочкой: «Удалить водяной знак», «Удалить фон» и «Вернуть оригинал».

Работает так же, как при импорте с сайта поставщика, ключи берутся из «Администрирование → Внешние сервисы». Оригинал сохраняется. Каждая обработка платная и тратит кредит сервиса.',
     '2026-09-30 11:10:00', CURRENT_TIMESTAMP),
    ('news_20260930_salon_kit',
     'Комплект на салон настраивается у товара',
     'Блок «Комплект на салон» на сайте можно включить или выключить у конкретного товара в его карточке. Если настройка не задана, работает прежнее правило: блок показывается у пассажирских сидений, кроме кресел.',
     '2026-09-30 11:00:00', CURRENT_TIMESTAMP),
    ('news_20260930_chat_unread',
     'Чат: непрочитанные свои сообщения затемнены',
     'Свои сообщения, которые ещё никто не прочитал, слегка затемнены — сразу видно, дошло ли сообщение до коллег.',
     '2026-09-30 10:50:00', CURRENT_TIMESTAMP),
    ('news_20260930_site_filter',
     'Длинные названия моделей в фильтре на сайте',
     'В фильтре «Подходит для» на сайте длинные названия, например «Fiat Ducato / Peugeot Boxer / Citroen Jumper X250 / X290», теперь переносятся внутри плашки, а счётчик остаётся справа.',
     '2026-09-30 10:40:00', CURRENT_TIMESTAMP);
