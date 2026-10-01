-- Переезд сайта без потери позиций (замер 01.10.2026, docs/SEO-SEMANTICS.md, «Исходные позиции»).

-- 1. Заголовки и описания категорий сидений — снова дословно со старого сайта (SITE-PRD, «Метатеги»).
-- «Сиденья для микроавтобусов» — первая страница сайта по кликам из поиска: менять её заголовок
-- одновременно со сменой адресов значит не понять, что уронило трафик. Новые заголовки
-- (миграция 20261001150000_seat_categories_meta) вернуть через 3–4 недели после переключения.
-- Тексты под списком товаров (seoText) остаются.
UPDATE "ProductCategory" SET
    "metaTitle" = 'Сиденья и комплектующие',
    "metaDescription" = 'Большой выбор сидений для любых автобусов. Гибкие цены. Возможность установки.'
WHERE "slug" = 'sidenja-i-komplektuyshie';

UPDATE "ProductCategory" SET
    "metaTitle" = 'Сиденья для микроавтобусов',
    "metaDescription" = 'Большой ассортимент комфортабельных, качественных и недорогих сидений для микроавтобусов. Сиденья для туристических автобусов, грузопассажирских и бизнес-купе в наличии.'
WHERE "slug" = 'sidenja-dlya-microavtobusov';

UPDATE "ProductCategory" SET
    "metaTitle" = 'Диваны для микроавтобусов купить',
    "metaDescription" = NULL
WHERE "slug" = 'divany-dlya-mikroavtobusov';

UPDATE "ProductCategory" SET
    "metaTitle" = 'Опоры сидений для микроавтобусов',
    "metaDescription" = 'Опоры сидений для микроавтобусов купить'
WHERE "slug" = 'opory-sidenij-dlya-mikroavtobusov';

UPDATE "ProductCategory" SET
    "metaTitle" = 'Комплектующие для сидений',
    "metaDescription" = 'Ремни безопасности, подлокотники, сетки, ножки крепления, столики для сидений'
WHERE "slug" = 'komplektuyshie-dlya-sidenij';

UPDATE "ProductCategory" SET
    "metaTitle" = 'Автобусные ремни безопасности купить',
    "metaDescription" = 'Ремни безопасности в салон микроавтобуса. Двухточечные и трехточечные. Инерционные и статические. Товар сертифицирован.'
WHERE "slug" = 'remni-bezopasanosti';

-- 2. Адреса удалённых товаров из индекса Яндекса, которых не было в карте старого сайта
-- (docs/site-snapshot/positions-2026-10-01/new-site-404.csv): на аналог или раздел, иначе на главную.
-- Вложенные пути и служебные index.php закрывает правило в коде (fallbackLocation).
INSERT INTO "UrlRedirect" ("id", "fromPath", "productId", "categoryId", "toPath", "statusCode")
SELECT 'seo20261001_divan_rivera', '/divan-rivera-dlya-mikroavtobusa', p."id", NULL, NULL, 301
FROM "Product" p WHERE p."slug" = 'divan-analog-rivera'
ON CONFLICT ("fromPath") DO NOTHING;

INSERT INTO "UrlRedirect" ("id", "fromPath", "productId", "categoryId", "toPath", "statusCode")
SELECT v."id", v."fromPath", NULL, c."id", NULL, 301
FROM (VALUES
    ('seo20261001_chehol', '/chehol-dlya-sidenja', 'komplektuyshie-dlya-sidenij'),
    ('seo20261001_opora_sdvig', '/opora-sidenja-so-sdvigom-v-bok', 'opory-sidenij-dlya-mikroavtobusov'),
    ('seo20261001_bampery', '/bampery', 'detali-kuzova-mikroavtobusa'),
    ('seo20261001_otopitel_oc7', '/otopitel-oc7', 'otopiteli')
) AS v("id", "fromPath", "categorySlug")
JOIN "ProductCategory" c ON c."slug" = v."categorySlug"
ON CONFLICT ("fromPath") DO NOTHING;

INSERT INTO "UrlRedirect" ("id", "fromPath", "productId", "categoryId", "toPath", "statusCode") VALUES
    ('seo20261001_webasto_2', '/webasto-2', NULL, NULL, '/', 301),
    ('seo20261001_pereoborudovanie', '/pereoborudovanie-mikroavtobusov', NULL, NULL, '/', 301)
ON CONFLICT ("fromPath") DO NOTHING;

-- Запись журнала «Новости платформы»
INSERT INTO "PlatformNews" ("id", "title", "body", "publishedAt", "updatedAt") VALUES
    ('news_20261001_seo_keep_titles',
     'Сайт: переезд без потери позиций в поиске, русские названия моделей',
     'Перед переездом на новый сайт мы сняли, по каким запросам и страницам старый сайт сейчас получает посетителей из Яндекса и Google. По итогам новый сайт теперь переадресует и те старые адреса, которых не было в карте сайта, но которые знает Яндекс: товар, открытый через чужой раздел, поиск по сайту, страницы корзины и оформления старого магазина. Раньше по ним открылась бы страница «не найдено».

У шести категорий раздела «Сиденья» заголовки для поисковика снова такие же, как на старом сайте: это самые посещаемые страницы, и при переезде их лучше не трогать. Новые заголовки вернём через несколько недель после запуска. Тексты под списком товаров остались.

На страницах моделей и в подборках «раздел + модель» к латинскому названию машины добавлено русское: «Сиденья для Ford Transit (Форд Транзит)», «Комплектующие для ГАЗель Next (Газель Некст)».',
     '2026-10-01 20:40:00', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
