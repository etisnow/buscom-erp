import path from "node:path";
import type { NextConfig } from "next";

/** Корень монорепозитория — от него считают пути трассировка standalone и Turbopack. */
const ROOT = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // Самодостаточный сервер для образа: сервер окажется в apps/site/server.js (см. Dockerfile)
  output: "standalone",
  outputFileTracingRoot: ROOT,
  turbopack: { root: ROOT },
  transpilePackages: ["@buscom/db", "@buscom/domain"],
  poweredByHeader: false,
  // CSS — отдельным файлом, не встроенным (`experimental.inlineCss` снят 01.10.2026, DECISIONS):
  // встроенный он лежал в HTML трижды — в <style> и дважды в данных RSC, 54 КБ сжатого HTML против 24
  // Картинки товаров — оптимизатор Next из /img/{id} (оригинал в базе): под размер экрана и в webp.
  // Только этот адрес и без параметров — иначе оптимизатором можно гонять что угодно.
  // Картинка по id не меняется (новая — новый id), поэтому кеш долгий.
  images: {
    localPatterns: [{ pathname: "/img/**", search: "" }],
    qualities: [75],
    formats: ["image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 365,
  },
};

export default nextConfig;
