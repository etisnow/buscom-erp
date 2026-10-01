-- Страницы моделей — на семейство, а не на поколение (01.10.2026): «Ford Transit 2015+» и
-- «Ford Transit 2000–2014» собираются на /modeli/ford-transit. Со старых адресов поколений — 301
-- на страницу семейства (packages/domain/src/site/models.ts, `modelFamily`).
INSERT INTO "UrlRedirect" ("id", "fromPath", "toPath", "statusCode") VALUES
    ('redir_models_citroen_jumpy_2017', '/modeli/citroen-jumpy-peugeot-expert-2017', '/modeli/citroen-jumpy-peugeot-expert', 301),
    ('redir_models_ducato_244', '/modeli/fiat-ducato-244', '/modeli/fiat-ducato-peugeot-boxer-citroen-jumper', 301),
    ('redir_models_ducato_x250', '/modeli/fiat-ducato-peugeot-boxer-citroen-jumper-x250-x290', '/modeli/fiat-ducato-peugeot-boxer-citroen-jumper', 301),
    ('redir_models_transit_2000', '/modeli/ford-transit-2000-2014', '/modeli/ford-transit', 301),
    ('redir_models_transit_2015', '/modeli/ford-transit-2015', '/modeli/ford-transit', 301),
    ('redir_models_daily_2006', '/modeli/iveco-daily-2006-2014', '/modeli/iveco-daily', 301),
    ('redir_models_daily_2015', '/modeli/iveco-daily-2015', '/modeli/iveco-daily', 301),
    ('redir_models_sprinter_classic', '/modeli/mercedes-sprinter-classic', '/modeli/mercedes-sprinter', 301),
    ('redir_models_sprinter_w906', '/modeli/mercedes-sprinter-w906', '/modeli/mercedes-sprinter', 301),
    ('redir_models_sprinter_w907', '/modeli/mercedes-sprinter-w907', '/modeli/mercedes-sprinter', 301),
    ('redir_models_master_iii', '/modeli/renault-master-iii', '/modeli/renault-master', 301),
    ('redir_models_crafter_2017', '/modeli/volkswagen-crafter-2017', '/modeli/volkswagen-crafter', 301),
    ('redir_models_crafter_w906', '/modeli/volkswagen-crafter-w906', '/modeli/volkswagen-crafter', 301),
    ('redir_models_transporter_t5', '/modeli/volkswagen-transporter-t5', '/modeli/volkswagen-transporter', 301)
ON CONFLICT ("fromPath") DO NOTHING;

-- Запись журнала «Новости платформы»
INSERT INTO "PlatformNews" ("id", "title", "body", "publishedAt", "updatedAt") VALUES
    ('news_20261001_model_families',
     'Подбор по модели: одна страница на машину, а не на каждое поколение',
     'Раньше на сайте для «Ford Transit 2000–2014» и «Ford Transit 2015+» были две отдельные страницы, и покупатель, ищущий просто «Форд Транзит», видел только часть товаров. Теперь страницы собраны по семействам: «Ford Transit», «Mercedes Sprinter», «Volkswagen Crafter», «Iveco Daily», «Fiat Ducato / Peugeot Boxer / Citroen Jumper» и другие. На странице семейства — все товары, подходящие хотя бы к одному поколению, и подпись, какие версии охвачены.

В карточке товара и в разметке совместимости ничего не меняется: поколения по-прежнему выбираются отдельно. «ГАЗель Next», «ГАЗель Бизнес», «ГАЗ Соболь» остаются отдельными страницами — это разные машины. Старые адреса поколений переадресуются на страницы семейств.',
     '2026-10-01 12:00:00', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
