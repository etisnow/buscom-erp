#!/bin/sh
# Ежедневная выгрузка базы. PRD требует: бэкап каждый день, хранение 30 дней,
# копия вне сервера с базой. Этот скрипт делает первые два пункта; вывоз копии
# наружу настраивается отдельно — см. docs/DEPLOY.md, «Бэкапы».
#
# Запуск из каталога с docker-compose.prod.yml:
#   ./scripts/backup-db.sh
#
# Выход с ненулевым кодом означает, что бэкап не сделан, — это повод для алерта,
# а не строчка в логе, которую никто не читает.

set -eu

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
STAMP="$(date +%Y-%m-%d_%H%M)"
FILE="/backups/buscom_${STAMP}.sql.gz"

# shellcheck disable=SC2086
$COMPOSE exec -T postgres sh -c "pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB --format=plain | gzip -9 > ${FILE}"

# Проверяем, что файл не пустой: молчаливо битый бэкап хуже отсутствующего.
# shellcheck disable=SC2086
SIZE="$($COMPOSE exec -T postgres sh -c "stat -c %s ${FILE}")"
if [ "$SIZE" -lt 1024 ]; then
  echo "Бэкап подозрительно мал (${SIZE} байт): ${FILE}" >&2
  exit 1
fi

# shellcheck disable=SC2086
$COMPOSE exec -T postgres sh -c "find /backups -name 'buscom_*.sql.gz' -mtime +${KEEP_DAYS} -delete"

echo "Бэкап готов: ${FILE} (${SIZE} байт), старше ${KEEP_DAYS} дн. удалены"
