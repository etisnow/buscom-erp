import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Нужен для forbidden() и экрана 403 (src/app/(app)/forbidden.tsx).
    authInterrupts: true,
  },
};

export default nextConfig;
