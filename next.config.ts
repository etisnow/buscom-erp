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
  },
};

export default nextConfig;
