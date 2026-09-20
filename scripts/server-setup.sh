#!/usr/bin/env bash
# Первичная подготовка сервера под BusCom ERP. Ubuntu 22.04 LTS.
# Запускать один раз от root:
#
#   bash server-setup.sh
#
# Что делает: ставит Docker из официального репозитория, заводит пользователя
# deploy для выката, клонирует репозиторий в /opt/buscom-erp, включает firewall.
# Скрипт идемпотентен — повторный запуск ничего не ломает.
#
# Что НЕ делает: не создаёт .env.production (там секреты — заполняет человек)
# и не запускает контейнеры. Дальше — по docs/DEPLOY.md.

set -euo pipefail

REPO="${REPO:-https://github.com/etisnow/buscom-erp.git}"
APP_DIR="${APP_DIR:-/opt/buscom-erp}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Запускать от root: sudo bash $0" >&2
  exit 1
fi

echo "==> Обновляем список пакетов"
apt-get update -qq
apt-get install -y -qq ca-certificates curl git ufw

echo "==> Docker"
if command -v docker >/dev/null 2>&1; then
  echo "    уже установлен: $(docker --version)"
else
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  echo "    поставлен: $(docker --version)"
fi

echo "==> Пользователь $DEPLOY_USER"
if id "$DEPLOY_USER" >/dev/null 2>&1; then
  echo "    уже есть"
else
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
# Управлять контейнерами без sudo. Членство в группе docker равносильно root —
# поэтому у пользователя нет пароля и вход только по ключу.
usermod -aG docker "$DEPLOY_USER"

echo "==> Репозиторий в $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  echo "    уже склонирован"
else
  git clone "$REPO" "$APP_DIR"
fi
mkdir -p "$APP_DIR/backups"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

echo "==> Firewall"
ufw allow OpenSSH
# APP_PORT — внутренний порт, на который хостинг проксирует 80/443
# (у Джино задаётся в «Проксирование портов 80/443», по умолчанию там 81).
# Если HTTPS поднимаем сами через Caddy на выделенном IP — открывать надо
# 80 и 443, а не этот порт: APP_PORT=80 EXTRA_PORTS=443 bash server-setup.sh
ufw allow "${APP_PORT:-81}/tcp"
for port in ${EXTRA_PORTS:-}; do
  ufw allow "${port}/tcp"
done
ufw --force enable
ufw status verbose

cat <<INSTRUCTIONS

Готово. Осталось руками:

  1. Положить публичный ключ для выката:
       mkdir -p /home/$DEPLOY_USER/.ssh
       nano /home/$DEPLOY_USER/.ssh/authorized_keys
       chmod 700 /home/$DEPLOY_USER/.ssh
       chmod 600 /home/$DEPLOY_USER/.ssh/authorized_keys
       chown -R $DEPLOY_USER:$DEPLOY_USER /home/$DEPLOY_USER/.ssh

  2. Создать $APP_DIR/.env.production по шаблону из docs/DEPLOY.md
     и закрыть его: chmod 600 $APP_DIR/.env.production

  3. Убедиться, что A-запись домена указывает на этот сервер,
     иначе Caddy не выпустит сертификат.

  4. Первый запуск — от пользователя $DEPLOY_USER:
       cd $APP_DIR
       docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

INSTRUCTIONS
