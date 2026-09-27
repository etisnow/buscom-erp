import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SITE_PAGE_NOTES } from "@buscom/domain/site/pages";
import { SitePageEditor } from "@/components/site/site-page-editor";
import { canEditCatalog } from "@/server/products/service";
import { requirePageUser } from "@/server/session";
import { listSitePages } from "@/server/site/pages";

export const metadata: Metadata = {
  title: "Страницы сайта — BusCom ERP",
};

export default async function SitePagesPage() {
  const user = await requirePageUser();
  const pages = await listSitePages();

  return (
    <main className="flex flex-col gap-4">
      <Link
        href="/products"
        className="text-muted-foreground inline-flex w-fit items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft className="size-4" />К списку товаров
      </Link>

      <div>
        <h1 className="font-heading text-xl font-semibold">Страницы сайта</h1>
        <p className="text-muted-foreground text-sm">
          Тексты страниц bus-com.ru. Правка появляется на сайте в течение 5 минут. Адреса страниц не меняются.
        </p>
      </div>

      {pages.map((page) => (
        <SitePageEditor
          key={page.slug}
          page={{ ...page, updatedAt: page.updatedAt?.toISOString() ?? null }}
          note={SITE_PAGE_NOTES[page.slug]}
          editable={canEditCatalog(user.role)}
        />
      ))}
    </main>
  );
}
