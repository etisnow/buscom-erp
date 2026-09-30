import type { Metadata } from "next";
import { NewsFeedView } from "@/components/news/news-feed";
import { ADMIN_ROLES, hasRole } from "@buscom/domain/user/role";
import { listNews } from "@/server/news/service";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = {
  title: "Новости платформы — BusCom ERP",
};

/**
 * Журнал новых возможностей ERP и сайта. Читают все сотрудники, записи ведёт администратор.
 * Открытие страницы отмечает записи прочитанными (src/components/news/news-feed.tsx).
 */
export default async function NewsPage() {
  const user = await requirePageUser();
  const feed = await listNews(user);

  return (
    <main className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-xl font-semibold">Новости платформы</h1>
        <p className="text-muted-foreground text-sm">Журнал новых возможностей ERP и сайта.</p>
      </div>
      <NewsFeedView feed={feed} isAdmin={hasRole(user.role, ADMIN_ROLES)} />
    </main>
  );
}
