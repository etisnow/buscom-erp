# syntax=docker/dockerfile:1

# Образ BusCom ERP. Многоступенчатая сборка: в рабочий слой попадает только
# standalone-вывод Next (`output: "standalone"` в apps/erp/next.config.ts) — без
# исходников, без pnpm и без dev-зависимостей.
#
# Репозиторий — монорепозиторий pnpm (apps/*, packages/*); контекст сборки —
# его корень. Standalone-вывод повторяет раскладку от корня: сервер в
# apps/erp/server.js, зависимости — в корневом node_modules/.pnpm.
#
# Цели сборки:
#   runner   — приложение (по умолчанию)
#   migrator — тот же код плюс Prisma CLI, чтобы накатывать миграции и сид
#
# Node 22 — та же мажорная версия, что в CI (.github/workflows/ci.yml).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# Зависимости. Отдельный слой: пересобирается только при правке манифестов,
# а не на каждое изменение кода.
# ---------------------------------------------------------------------------
FROM base AS deps
# pnpm-workspace.yaml обязателен: в нём allowBuilds, разрешающий build-скрипты
# prisma и esbuild. Без него pnpm 12 падает с ERR_PNPM_IGNORED_BUILDS, а не
# пропускает их молча. В CI файл был и ошибка не всплывала — только в образе.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/erp/package.json apps/erp/prisma.config.ts ./apps/erp/
COPY apps/erp/prisma ./apps/erp/prisma
# postinstall запускает prisma generate — отсюда apps/erp/src/generated/prisma
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Сборка. Поверх установленных зависимостей: node_modules в контекст сборки не
# попадает (.dockerignore), так что COPY их не затирает — ни корневые, ни ссылки
# pnpm в apps/erp/node_modules.
# ---------------------------------------------------------------------------
FROM deps AS builder
COPY . .

# Заглушки только на время сборки: src/server/env.ts валидирует переменные при
# импорте модуля. Боевые значения приходят в рантайме из окружения контейнера,
# в образ эти строки не попадают — слой сборки в рабочий образ не копируется.
# NEXT_PUBLIC_-переменных в проекте нет, поэтому в клиентский бандл ничего
# из них не вшивается.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    BETTER_AUTH_SECRET="build-only-not-a-real-secret-32-chars" \
    BETTER_AUTH_URL="http://localhost:3000" \
    SITE_WEBHOOK_SECRET="build-only-not-a-real-secret-32-chars" \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @buscom/erp build

# ---------------------------------------------------------------------------
# Миграции и сид. Отдельная цель со всем инструментарием: в рабочем образе
# ни Prisma CLI, ни схемы нет, и это правильно — накат миграций должен быть
# осознанным шагом, а не побочным эффектом старта контейнера.
# ---------------------------------------------------------------------------
FROM builder AS migrator
ENV NODE_ENV=production
# Здесь prisma.config.ts и схема; `run --rm migrate pnpm db:seed` тоже отсюда
WORKDIR /app/apps/erp
CMD ["pnpm", "prisma", "migrate", "deploy"]

# ---------------------------------------------------------------------------
# Рабочий образ
# ---------------------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Приложение не должно работать от root.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# standalone уже содержит отобранные зависимости; статику Next кладёт отдельно.
COPY --from=builder --chown=nextjs:nodejs /app/apps/erp/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/erp/.next/static ./apps/erp/.next/static
# public/ standalone тоже не берёт: иконки приложения для телефона (манифест, пуши).
COPY --from=builder --chown=nextjs:nodejs /app/apps/erp/public ./apps/erp/public

# Воркер Tesseract (распознавание накладной) ищет зависимости через скрытый
# каталог pnpm node_modules/.pnpm/node_modules. Файлы пакетов standalone
# получает из outputFileTracingIncludes (next.config.ts, тот же список), а вот
# ссылки в этот каталог Next ставит только тем, кого нашла трассировка. Пакета
# нет — сборка падает здесь, а не кнопкой «Заполнить из накладной» в бою.
RUN cd node_modules/.pnpm && mkdir -p node_modules && \
    for name in tesseract.js-core bmp-js idb-keyval is-url node-fetch regenerator-runtime \
                wasm-feature-detect zlibjs whatwg-url tr46 webidl-conversions; do \
      [ -e "node_modules/$name" ] && continue; \
      dir=$(ls -d "$name"@*/ 2>/dev/null | head -n 1); \
      [ -n "$dir" ] || { echo "Нет пакета $name в standalone"; exit 1; }; \
      ln -s "../${dir%/}/node_modules/$name" "node_modules/$name"; \
    done

# Модель Tesseract код ищет от рабочего каталога сервера (apps/erp):
# apps/erp/node_modules/@tesseract.js-data/rus — так она лежит в dev. В standalone
# монорепозитория пакет есть только в node_modules/.pnpm — ставим туда ссылку.
RUN dir=$(ls -d node_modules/.pnpm/@tesseract.js-data+rus@*/node_modules/@tesseract.js-data/rus 2>/dev/null | head -n 1) && \
    { [ -n "$dir" ] || { echo "Нет модели @tesseract.js-data/rus в standalone"; exit 1; }; } && \
    mkdir -p apps/erp/node_modules/@tesseract.js-data && \
    ln -s "/app/$dir" apps/erp/node_modules/@tesseract.js-data/rus

# Распознавание накладной проверяется в самом образе: проверка живости его не
# трогает, и первый выкат с OCR прошёл её при неработающей кнопке. Скрипт
# кладётся в .next/server, чтобы подключать пакеты как само приложение; в
# образе не остаётся.
WORKDIR /app/apps/erp
COPY --from=builder /app/apps/erp/scripts/ocr-smoke.mjs ./.next/server/ocr-smoke.mjs
RUN node .next/server/ocr-smoke.mjs && rm .next/server/ocr-smoke.mjs

USER nextjs
EXPOSE 3000

# Проверка живости: на /login приложение отвечает без сессии и без БД.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Рабочий каталог — apps/erp (задан выше), сервер там же
CMD ["node", "server.js"]
