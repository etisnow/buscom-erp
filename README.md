# BusCom ERP

Внутренняя админка для обработки заказов с сайта [bus-com.ru](https://bus-com.ru/).

- [docs/STATUS.md](docs/STATUS.md) — где мы сейчас и что дальше
- [docs/PRD.md](docs/PRD.md) — требования и критерии приёмки
- [docs/DECISIONS.md](docs/DECISIONS.md) — принятые решения и причины
- [CLAUDE.md](CLAUDE.md) — правила разработки (в том числе для AI-агентов)

## Быстрый старт

Нужны Node.js 22+, pnpm и PostgreSQL 16 (проще всего — Docker).

```bash
pnpm install
cp .env.example .env        # заполнить секреты
pnpm db:up                  # Postgres в Docker; или свой инстанс — поправить DATABASE_URL
pnpm db:deploy  # применить миграции
pnpm dev                    # http://localhost:3000
```

## Проверки

```bash
pnpm check   # typecheck + lint + unit-тесты
pnpm build   # продакшен-сборка
```

Те же проверки (плюс `format:check` и `prisma validate`) запускает CI на каждый push в `main` и `development` и на каждый PR. Коммиты идут в `development`; в `main` вливает владелец — этот мерж и выкатывает на сервер.

## Боевой контур

Админка: `https://erp.bus-com.ru`. Рунбук, бэкапы и разбор типовых неполадок — [docs/DEPLOY.md](docs/DEPLOY.md).

**Логин и пароль администратора** лежат на сервере, в репозиторий не попадают. Посмотреть — со своей машины по SSH:

```bash
ssh -p 49265 deploy@ba5699d52128.vps.myjino.ru 'grep SEED_ADMIN /opt/buscom-erp/.env.production'
```

Или в панели Джино, вкладка «Консоль», одной командой:

```bash
grep SEED_ADMIN /opt/buscom-erp/.env.production
```

`SEED_ADMIN_EMAIL` — логин, `SEED_ADMIN_PASSWORD` — временный пароль. Он лежит там открытым текстом, поэтому после первого входа его меняют, а значение в файле затирают: сид идемпотентен и существующего пользователя не трогает.
