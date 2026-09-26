import type { Metadata } from "next";
import { Golos_Text, IBM_Plex_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_ORIGIN } from "@/config/company";
import "./globals.css";

// Шрифты скачиваются при сборке и раздаются с нашего домена — браузер к Google
// не ходит (docs/SITE-PRD.md, «Скорость»)
const golos = Golos_Text({ variable: "--font-golos", subsets: ["latin", "cyrillic"], display: "swap" });
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Баском — комплектующие для микроавтобусов",
    template: "%s | Баском",
  },
  description: "Продажа комплектующих для микроавтобусов (сиденья, люки, полки, поручни, подножки и т.д.)",
  // Подтверждение прав в Яндекс.Вебмастере — перенесено со старого сайта как есть
  verification: { yandex: "5849b7bce8a74991" },
  openGraph: { siteName: "Баском", locale: "ru_RU", type: "website" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${golos.variable} ${plexMono.variable} antialiased`}>
      <body className="flex min-h-screen flex-col font-sans">
        <SiteHeader />
        <main className="mx-auto w-full max-w-7xl grow px-4 py-8">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
