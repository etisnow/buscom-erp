-- Сайт использует отдельную роль только для чтения каталога.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'buscom_site') THEN
    GRANT SELECT ON "_ExtraProductCategories" TO buscom_site;
  END IF;
END
$$;
