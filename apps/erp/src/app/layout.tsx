import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "BusCom ERP",
  description: "Управление заказами bus-com.ru",
  // Админку поисковикам не отдаём. Тот же запрет идёт заголовком X-Robots-Tag
  // (next.config.ts) — тег в разметке остаётся, даже если запрос пройдёт мимо него.
  robots: { index: false, follow: false },
  // Приложение на главном экране iPhone: без адресной строки и со своей иконкой.
  // Манифест — src/app/manifest.ts
  appleWebApp: { capable: true, title: "BusCom", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

/**
 * `viewport-fit=cover`: страница занимает экран целиком, а отступы под «чёлку» и полосу
 * жестов берутся из env(safe-area-inset-*). Без него эти значения всегда 0, и нижние
 * панели на iPhone уходили бы под полосу жестов.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
