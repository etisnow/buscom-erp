@AGENTS.md

# BusCom ERP

Внутренняя админка для обработки заказов с сайта bus-com.ru (комплектующие для микроавтобусов).

## Начало и конец сессии

1. **В начале** прочитай `docs/STATUS.md` — текущий этап, следующий шаг, известные проблемы. Не начинай с нуля и не переделывай отмеченное.
2. Требования и критерии приёмки — `docs/PRD.md`. Если задача противоречит PRD — спроси, а не угадывай.
3. Почему сделано именно так — `docs/DECISIONS.md`. Не откатывай решения оттуда без согласования.
4. **В конце** (или после заметного куска работы) обнови `docs/STATUS.md`: отметь сделанное, допиши найденные проблемы, поправь «Следующий шаг». Новое архитектурное решение — запись в `docs/DECISIONS.md`.
5. Изменились требования → обнови `docs/PRD.md` и скажи человеку, что живой документ (ссылка в шапке PRD) тоже нужно поправить.

Новый сайт bus-com.ru на общей с ERP базе — отдельные документы: требования `docs/SITE-PRD.md`, план работ `docs/SITE-PLAN.md`.

Сайт bus-com.ru может не открываться из сессии (VPN) — сведения о нём спрашивай у человека.

## Стек

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind 4 · PostgreSQL 16 + Prisma 7 (driver adapter `@prisma/adapter-pg`) · Better Auth · Zod 4 · Vitest · pnpm.

Next 16 и Prisma 7 новее, чем твои знания: перед кодом на незнакомом API читай `node_modules/next/dist/docs/` и скиллы `.claude/skills/prisma-*`.

## Команды

Монорепозиторий pnpm: команды из корня идут по всем пакетам, `pnpm erp <скрипт>` — скрипт приложения ERP (`apps/erp/package.json`).

```bash
pnpm dev                # dev-сервер ERP на :3000
pnpm check              # format:check + typecheck + lint + test во всех пакетах — прогоняй перед «готово»
pnpm --filter @buscom/domain test src/order/status.test.ts   # одиночный файл (так же `pnpm erp test …`)
pnpm format             # prettier
pnpm db:tunnel          # SSH-туннель до общей dev-базы — нужен всё время, пока идёт работа (docs/DEV-DB.md)
pnpm erp db:up          # Postgres в Docker (docker-compose.yml) — запасная локальная база
pnpm erp db:pull        # скопировать общую базу в локальную — чтобы работать без сети
pnpm erp db:seed        # первый администратор ERP
pnpm db:migrate         # prisma migrate dev — создаёт миграцию после правки packages/db/prisma/schema.prisma
pnpm db:generate        # перегенерировать клиент в packages/db/src/generated/prisma
```

`.env` ERP лежит в `apps/erp/.env`.

## Структура и слои

```
apps/erp/       ERP (erp.bus-com.ru). Всё, что ниже, — внутри него:
src/
  app/          страницы, layout, route handlers (api/). Тонкий слой: вызывает server/
  server/       серверные сервисы, доступ к БД, авторизация, проверка прав. Всё с `import "server-only"`
scripts/        импорт, выгрузки, снимок старого сайта (tsx)
---
apps/site/      сайт bus-com.ru — в работе (docs/SITE-PLAN.md)
packages/domain/ чистая бизнес-логика без БД и Next: статусы, деньги, итоги, нормализация (`@buscom/domain/<путь>`). Покрыта тестами
packages/db/    схема Prisma, миграции, сгенерированный клиент (`@buscom/db/client`, `@buscom/db/enums`) — не редактировать, не коммитить src/generated
docs/           PRD и прочие документы (в корне)
scripts/        серверные скрипты и туннель (в корне)
```

Зависимости только сверху вниз: `app → server → @buscom/domain`. Домен не импортирует ни Prisma Client, ни Next, ни код приложений (типы enum из `@buscom/db/enums` — можно); внутри пакета импорты относительные.

## Правила предметной области

- **Деньги — целые копейки** (`Int`, поля `*Kopecks`, тип `Kopecks` из `packages/domain/src/money.ts`). Никаких float-рублей в расчётах и в БД; рубли только в UI через `formatRub` / `rublesToKopecks`.
- **Итоги заказа считает сервер** через `calculateOrderTotals`. Суммы с клиента не принимаются.
- **Статус заказа меняется только через `assertTransition`** (`packages/domain/src/order/status.ts`). Новый статус или переход — сначала туда + тест, потом UI.
- **Каждое изменение заказа пишет `OrderEvent`** в той же транзакции (`db.$transaction`). Это и история в карточке, и аудит.
- **Позиция заказа хранит снимок** sku/name/price — не ссылайся на текущую цену товара при показе старых заказов.
- **Заказы не удаляются физически** — только `deletedAt`.
- **Телефоны клиентов** хранятся нормализованными (`normalizePhone`, формат `+7XXXXXXXXXX`).
- **Интеграция с сайтом**: сырой payload сначала сохраняется в `IntegrationInbox`, потом разбирается; идемпотентность по `(source, externalId)`.

## Код

- Мутации — Server Actions или route handlers; вход валидируется Zod-схемой; права проверяются на сервере в каждом действии.
- Секреты и конфиг — только через `src/server/env.ts`. Новая переменная → `env.ts` + `.env.example`.
- Типы массивов — `T[]`, не `Array<T>`.
- UI, тексты ошибок и комментарии — на русском. Идентификаторы в коде — на английском.
- Время хранится в UTC, показывается в Europe/Moscow.
- Новая доменная логика → тест рядом (`*.test.ts`). Баг в домене → сначала падающий тест.

## Нельзя

- Редактировать применённые миграции в `prisma/migrations/` — только новая миграция.
- `prisma migrate reset`, `db push --force-reset` и любые команды, стирающие данные, без явной просьбы. База разработки общая для двух машин — такая команда стирает и чужую работу.
- Коммитить `.env` и секреты.
