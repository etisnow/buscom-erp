-- В описаниях комплектов категории «Обшивка салона» убираем в конце блок «Цены на отдельные элементы»
-- с прайсом по деталям — он устаревал. Описание до этого блока не меняется.
UPDATE "Product"
SET "description" = rtrim(regexp_replace("description", E'[[:space:]]*Цены на отдельные элементы в руб\.:.*$', ''))
WHERE "description" LIKE '%Цены на отдельные элементы в руб.:%'
  AND "categoryId" IN (SELECT "id" FROM "ProductCategory" WHERE "slug" = 'obivka-salona');
