#!/bin/sh
# Выгрузка базы. PRD требует: бэкап каждый день, хранение 30 дней, копия вне
# сервера с базой. Этот скрипт делает первые два пункта; вывоз копии наружу
# настраивается отдельно — см. docs/DEPLOY.md, «Бэкапы».
#
# Два режима, потому что картинки товаров лежат в базе (`ProductImage.data`) и
# весят больше всей остальной базы вместе взятой:
#
#   ./scripts/backup-db.sh           # ежедневно: вся база, но без байтов картинок
#   ./scripts/backup-db.sh --images  # раз в неделю: только байты картинок
#
# Ежедневный дамп остаётся в десятках мегабайт, и тридцать дней хранения
# помещаются на диск. Картинки меняются редко (только прогоном
# `pnpm import:site-images`), а то, что приехало с bus-com.ru, в крайнем случае
# качается оттуда заново — поэтому им хватает недельного ритма и двух копий.
#
# Восстановление — из двух файлов по порядку: сначала ежедневный (он создаёт
# таблицы, `ProductImage` будет пустой), потом выгрузка картинок.
#
# Выход с ненулевым кодом означает, что бэкап не сделан, — это повод для алерта,
# а не строчка в логе, которую никто не читает.

set -eu

COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
STAMP="$(date +%Y-%m-%d_%H%M)"

if [ "${1:-}" = "--images" ]; then
  KEEP_DAYS="${BACKUP_IMAGES_KEEP_DAYS:-14}"
  PATTERN="buscom-images_*.sql.gz"
  FILE="/backups/buscom-images_${STAMP}.sql.gz"
  # Только строки таблицы: схему создаёт ежедневный дамп.
  DUMP="pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB --format=plain --data-only --table='\"ProductImage\"'"
  WHAT="картинки"
else
  KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
  PATTERN="buscom_*.sql.gz"
  FILE="/backups/buscom_${STAMP}.sql.gz"
  # Таблица картинок в дамп попадает, а её строки — нет: пустая таблица нужна,
  # иначе при восстановлении выгрузку картинок будет некуда заливать.
  DUMP="pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB --format=plain --exclude-table-data='\"ProductImage\"'"
  WHAT="база без картинок"
fi

# shellcheck disable=SC2086
$COMPOSE exec -T postgres sh -c "${DUMP} | gzip -9 > ${FILE}"

# Проверяем, что файл не пустой: молчаливо битый бэкап хуже отсутствующего.
# shellcheck disable=SC2086
SIZE="$($COMPOSE exec -T postgres sh -c "stat -c %s ${FILE}")"
if [ "$SIZE" -lt 1024 ]; then
  echo "Бэкап подозрительно мал (${SIZE} байт): ${FILE}" >&2
  exit 1
fi

# Чистим только свой вид выгрузок: у ежедневных и у картинок разный срок хранения.
# shellcheck disable=SC2086
$COMPOSE exec -T postgres sh -c "find /backups -name '${PATTERN}' -mtime +${KEEP_DAYS} -delete"

echo "Бэкап готов (${WHAT}): ${FILE} (${SIZE} байт), старше ${KEEP_DAYS} дн. удалены"
