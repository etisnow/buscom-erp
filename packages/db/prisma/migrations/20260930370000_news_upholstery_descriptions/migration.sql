-- Запись журнала «Новости платформы»: прайс убран из описаний комплектов обшивки салона.
INSERT INTO "PlatformNews" ("id", "title", "body", "publishedAt", "updatedAt") VALUES
    ('news_20260930_upholstery_descriptions',
     'Обшивка салона: в описаниях двух комплектов убран прайс по деталям',
     'В описаниях двух комплектов обшивки салона (для Ford Transit и для Citroen Jumper / Peugeot Boxer / Fiat Ducato) убран блок «Цены на отдельные элементы» — цены деталей устаревали. Всё остальное описание осталось.',
     '2026-09-30 18:20:00', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
