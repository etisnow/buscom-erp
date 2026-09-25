import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Сборка в самодостаточный сервер: в образ кладём только .next/standalone
  // с уже отобранными зависимостями, а не весь node_modules (см. docs/DEPLOY.md).
  output: "standalone",
  // pdfmake читает свои шрифты (Roboto с кириллицей) с диска по пути внутри
  // собственного пакета. Из бандла этот путь не восстановить: в standalone-сборке
  // pnpm держит пакет в node_modules/.pnpm/…, верхнеуровневой записи нет, и
  // генерация PDF падала ENOENT'ом — при этом в dev работала. Нативный require
  // возвращает пакету нормальное место в node_modules рядом с сервером.
  // Распознавание накладной (src/server/orders/waybill-recognition.ts): Tesseract
  // запускает воркер по пути внутри своего пакета и грузит WASM с диска, canvas —
  // нативный модуль, zxing и unpdf тоже тянут WASM. Бандлер всё это ломает.
  serverExternalPackages: ["pdfmake", "tesseract.js", "tesseract.js-core", "@napi-rs/canvas", "unpdf", "zxing-wasm"],
  // Tesseract грузит воркер, его зависимости, ядро WASM и русскую модель по
  // вычисленным путям — трассировка standalone их не видит, и в бою кнопка
  // «Заполнить из накладной» падала бы «Cannot find module». Пути — раскладка
  // pnpm (node_modules/.pnpm/<пакет>@<версия>/node_modules/<пакет>). Ядро целиком:
  // вариант (simd, relaxedsimd, lstm) воркер выбирает по процессору сервера.
  outputFileTracingIncludes: {
    "/orders/[number]": [
      "./node_modules/@tesseract.js-data/rus/4.0.0_best_int/**",
      // Каждый пакет своим путём: шаблон на весь node_modules цепляет симлинки
      // pnpm, и Turbopack падает на них «Отказано в доступе» (Windows). Тот же
      // список — в Dockerfile: там пакетам ставятся ссылки для воркера.
      ...[
        "tesseract.js",
        "tesseract.js-core",
        "bmp-js",
        "idb-keyval",
        "is-url",
        "node-fetch",
        "regenerator-runtime",
        "wasm-feature-detect",
        "zlibjs",
        "whatwg-url",
        "tr46",
        "webidl-conversions",
      ].map((name) => `./node_modules/.pnpm/${name}@*/node_modules/${name}/**`),
    ],
  },
  experimental: {
    // Нужен для forbidden() и экрана 403 (src/app/(app)/forbidden.tsx).
    authInterrupts: true,
    serverActions: {
      // Картинка товара уходит в Server Action целиком. Сама картинка — до 5 МБ
      // (MAX_IMAGE_BYTES в src/domain/product/images.ts), сверху запас на обёртку формы.
      bodySizeLimit: "6mb",
    },
  },
  /**
   * Админка не для поисковых систем. Заголовок ставит само приложение, а не
   * Caddy: в бою HTTPS терминирует прокси хостинга, до конфига Caddy дело не
   * дошло, и на живом `erp.bus-com.ru` заголовка не было (проверено 24.09.2026).
   * `noindex` сильнее robots.txt: тот запрещает обход, но не попадание адреса в
   * выдачу. Страница входа открыта всем — закрывать нужно именно её.
   */
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
};

export default nextConfig;
