-- Адреса из Search Console (страницы с показами в Google, 30.06–28.09.2026,
-- docs/site-snapshot/positions-2026-10-01/gsc-pages.tsv), которые не закрывают ни таблица, ни
-- правило fallbackLocation: опечатки и прежние варианты слугов. Ведём на товар или раздел.
INSERT INTO "UrlRedirect" ("id", "fromPath", "productId", "categoryId", "toPath", "statusCode")
SELECT v."id", v."fromPath", p."id", NULL, NULL, 301
FROM (VALUES
    ('seo20261002_shtorki_on_transit', '/shtorki-on-ford-transit-do-2014', 'shtorki-na-ford-transit-do-2014'),
    ('seo20261002_shtorki_on_boxer', '/shtorki-on-peugeot-boxer', 'shtorki-na-peugeot-boxer'),
    ('seo20261002_divan_na_cyr', '/divan-raskladnoj-на-gazel-gazon', 'divan-raskladnoj-na-gazel-gazon'),
    ('seo20261002_shtorki_crafter_t5', '/shtorki-na-volkswagen-crafter-t5', 'shtorki-na-volkswagen-crafter')
) AS v("id", "fromPath", "productSlug")
JOIN "Product" p ON p."slug" = v."productSlug"
ON CONFLICT ("fromPath") DO NOTHING;

INSERT INTO "UrlRedirect" ("id", "fromPath", "productId", "categoryId", "toPath", "statusCode")
SELECT v."id", v."fromPath", NULL, c."id", NULL, 301
FROM (VALUES
    ('seo20261002_sidenja_v_micro', '/sidenja-v-microavtobus-avtobus', 'sidenja-dlya-microavtobusov'),
    ('seo20261002_shtorki_dlya_transit', '/shtorki-dlya-ford-transit', 'storki-dlya-mikroavtobusov')
) AS v("id", "fromPath", "categorySlug")
JOIN "ProductCategory" c ON c."slug" = v."categorySlug"
ON CONFLICT ("fromPath") DO NOTHING;
