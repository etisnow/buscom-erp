-- Только данные. Названия вариантов опций, перенесённые с bus-com.ru, у вариантов-
-- плашек (цвет, сторона) начинались с тега <img> превью: «<img src=… alt="Бежевый" /> Бежевый».
-- Разбор страницы теперь теги вырезает (packages/domain/src/product/site-catalog.ts,
-- valueName); здесь чистятся уже сохранённые. Снимки в позициях заказов не трогаем —
-- на 26.09.2026 таких позиций нет.
UPDATE "ProductOptionValue"
SET "name" = btrim(regexp_replace(regexp_replace("name", '<[^>]*>', ' ', 'g'), '\s+', ' ', 'g'))
WHERE "name" LIKE '%<%>%';
