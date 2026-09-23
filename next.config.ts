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
  serverExternalPackages: ["pdfmake"],
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
