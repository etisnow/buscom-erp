-- Роль базы для сайта bus-com.ru: только чтение каталога (docs/DEPLOY.md,
-- «Роль базы для сайта»). Заказы сайт отправляет в ERP по API, писать в базу
-- ему незачем — взломанный сайт не должен видеть клиентов и заказы.
--
-- Повторяемый: запускать заново, когда сайт начинает читать новую таблицу
-- (список — все `db.<модель>` в apps/site/src, вместе с вложенными выборками).
--
--   docker compose exec -T postgres psql -U buscom -d buscom_erp \
--     -v site_password="'<пароль>'" -f - < scripts/site-db-role.sql

\set ON_ERROR_STOP on

SELECT 'CREATE ROLE buscom_site LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'buscom_site') \gexec

ALTER ROLE buscom_site PASSWORD :site_password;

-- У PUBLIC право CONNECT к боевой базе снято (docs/DEV-DB.md) — даём явно
SELECT format('GRANT CONNECT ON DATABASE %I TO buscom_site', current_database()) \gexec
GRANT USAGE ON SCHEMA public TO buscom_site;
GRANT SELECT ON
  "Product",
  "ProductCategory",
  "ProductImage",
  "ProductOption",
  "ProductOptionValue",
  "UrlRedirect",
  "SitePage",
  "CarrierTerminal",
  "SalonLayout"
TO buscom_site;
