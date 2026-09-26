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
};

export default nextConfig;
