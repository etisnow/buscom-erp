import "server-only";
import { newsInputSchema } from "@buscom/domain/news";
import { ADMIN_ROLES, hasRole } from "@buscom/domain/user/role";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { SessionUser } from "@/server/session";

/**
 * Новости платформы — журнал новых возможностей. Читают все сотрудники, пишет администратор.
 * У каждой записи есть отметка «прочитано» по сотрудникам: новая для сотрудника запись — та,
 * у которой для него нет отметки. Число таких записей — значок у пункта меню.
 */

/** Сколько записей показывает страница; журнал не должен разрастаться в бесконечную ленту. */
const PAGE_LIMIT = 100;

export type NewsPostView = {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
  authorName: string | null;
  /** Прочитал ли запись тот, кто смотрит */
  read: boolean;
  /** Кто прочитал — только для администратора; остальным null */
  readers: string[] | null;
};

export type NewsFeed = {
  posts: NewsPostView[];
  /** Сколько сотрудников должны прочитать запись: все действующие */
  audience: number;
};

export async function listNews(user: SessionUser): Promise<NewsFeed> {
  const isAdmin = hasRole(user.role, ADMIN_ROLES);
  const [rows, audience] = await Promise.all([
    db.platformNews.findMany({
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: PAGE_LIMIT,
      select: {
        id: true,
        title: true,
        body: true,
        publishedAt: true,
        author: { select: { name: true } },
        // Кто прочитал видит только администратор; остальным хватает своей отметки
        reads: isAdmin
          ? { select: { userId: true, user: { select: { name: true, isActive: true } } }, orderBy: { readAt: "asc" } }
          : { where: { userId: user.id }, select: { userId: true } },
      },
    }),
    db.user.count({ where: { isActive: true } }),
  ]);

  return {
    audience,
    posts: rows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      publishedAt: row.publishedAt.toISOString(),
      authorName: row.author?.name ?? null,
      read: row.reads.some((read) => read.userId === user.id),
      readers: isAdmin
        ? row.reads.flatMap((read) => ("user" in read && read.user.isActive ? [read.user.name] : []))
        : null,
    })),
  };
}

/** Записи, которых сотрудник ещё не видел, — число у пункта меню. */
export async function unreadNewsCount(userId: string): Promise<number> {
  return db.platformNews.count({ where: { reads: { none: { userId } } } });
}

/** Отметить прочитанными все записи, которые сотрудник видит на странице. Возвращает, сколько отмечено. */
export async function markNewsRead(user: SessionUser): Promise<number> {
  const unread = await db.platformNews.findMany({
    where: { reads: { none: { userId: user.id } } },
    select: { id: true },
  });
  if (unread.length === 0) return 0;
  const { count } = await db.platformNewsRead.createMany({
    data: unread.map((post) => ({ newsId: post.id, userId: user.id })),
    skipDuplicates: true,
  });
  return count;
}

function assertAdmin(user: SessionUser): void {
  if (!hasRole(user.role, ADMIN_ROLES)) throw new ForbiddenError("Записи журнала ведёт администратор");
}

function parseNews(input: unknown) {
  const parsed = newsInputSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Некорректная запись");
  return parsed.data;
}

/** Новая запись. Автор её сразу «прочитал» — своё в меню новым не считается. */
export async function createNews(input: unknown, user: SessionUser): Promise<void> {
  assertAdmin(user);
  const data = parseNews(input);
  await db.platformNews.create({
    data: { ...data, authorId: user.id, reads: { create: { userId: user.id } } },
    select: { id: true },
  });
}

/**
 * Правка текста. Отметки «прочитано» остаются: поправленная опечатка не должна снова
 * зажигать значок у всех.
 */
export async function updateNews(id: string, input: unknown, user: SessionUser): Promise<void> {
  assertAdmin(user);
  await db.platformNews.update({ where: { id }, data: parseNews(input), select: { id: true } });
}

export async function deleteNews(id: string, user: SessionUser): Promise<void> {
  assertAdmin(user);
  await db.platformNews.delete({ where: { id }, select: { id: true } });
}
