import type { Metadata } from "next";
import { Golos_Text, IBM_Plex_Mono } from "next/font/google";
import { Metrika } from "@/components/analytics/metrika";
import { CatalogNav } from "@/components/catalog-nav";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { COMPANY, SITE_ORIGIN } from "@/config/company";
import { siteEnv } from "@/env";
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

/** Разметка Organization на всех страницах (docs/SITE-PRD.md, «Метатеги и разметка»). */
const ORGANIZATION = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: COMPANY.brand,
  legalName: COMPANY.legalName,
  url: `${SITE_ORIGIN}/`,
  email: COMPANY.email,
  telephone: COMPANY.phone.display,
  taxID: COMPANY.inn,
  address: {
    "@type": "PostalAddress",
    addressCountry: "RU",
    addressLocality: COMPANY.warehouse.city,
    streetAddress: COMPANY.warehouse.street,
  },
};

// Меню каталога читает базу — рендер на запрос, данные из кеша (src/server/catalog.ts)
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${golos.variable} ${plexMono.variable} antialiased`}>
      <body className="flex min-h-screen flex-col font-sans">
        <SiteHeader />
        <CatalogNav />
        <main className="mx-auto w-full max-w-7xl grow px-4 py-8">{children}</main>
        <SiteFooter />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION) }} />
        {siteEnv().SITE_INDEXING ? <Metrika /> : null}
      </body>
    </html>
  );
}
