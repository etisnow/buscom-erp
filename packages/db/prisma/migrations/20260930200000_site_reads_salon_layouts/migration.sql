-- Сайт читает схемы салона (блок «Комплект на салон»). Он ходит в базу отдельной ролью buscom_site
-- только на чтение (docs/DEPLOY.md, «Роль базы для сайта», scripts/site-db-role.sql). Роль есть не
-- в каждой базе (в локальной и CI её нет), поэтому право выдаётся, только если она существует.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'buscom_site') THEN
    GRANT SELECT ON "SalonLayout" TO buscom_site;
  END IF;
END
$$;
