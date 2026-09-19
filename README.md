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
pnpm prisma migrate deploy  # применить миграции
pnpm dev                    # http://localhost:3000
```

## Проверки

```bash
pnpm check   # typecheck + lint + unit-тесты
pnpm build   # продакшен-сборка
```

Те же проверки (плюс `format:check` и `prisma validate`) запускает CI на каждый push в `main` и каждый PR.
