# syntax=docker/dockerfile:1

# Образ BusCom ERP. Многоступенчатая сборка: в рабочий слой попадает только
# standalone-вывод Next (`output: "standalone"` в next.config.ts) — без
# исходников, без pnpm и без dev-зависимостей.
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
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
# postinstall запускает prisma generate — отсюда src/generated/prisma
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Сборка
# ---------------------------------------------------------------------------
FROM base AS builder
COPY . .
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/src/generated ./src/generated

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
RUN pnpm build

# ---------------------------------------------------------------------------
# Миграции и сид. Отдельная цель со всем инструментарием: в рабочем образе
# ни Prisma CLI, ни схемы нет, и это правильно — накат миграций должен быть
# осознанным шагом, а не побочным эффектом старта контейнера.
# ---------------------------------------------------------------------------
FROM builder AS migrator
ENV NODE_ENV=production
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
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

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

USER nextjs
EXPOSE 3000

# Проверка живости: на /login приложение отвечает без сессии и без БД.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
