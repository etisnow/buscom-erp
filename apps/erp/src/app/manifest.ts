import type { MetadataRoute } from "next";

/**
 * Манифест приложения: ERP ставится на главный экран телефона и открывается без
 * адресной строки. На iPhone без этого нет пуш-уведомлений — Safari даёт их только
 * приложениям с главного экрана (iOS 16.4+).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BusCom ERP",
    short_name: "BusCom",
    description: "Заказы, клиенты и чат сотрудников bus-com.ru",
    start_url: "/orders",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#008244",
    lang: "ru",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
