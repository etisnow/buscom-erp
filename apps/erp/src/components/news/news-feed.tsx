"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { splitOrderLinks } from "@buscom/domain/chat/order-links";
import { MAX_NEWS_BODY, MAX_NEWS_TITLE } from "@buscom/domain/news";
import { formatMoscowDate } from "@buscom/domain/datetime";
import {
  createNewsAction,
  deleteNewsAction,
  markNewsReadAction,
  updateNewsAction,
  type NewsResult,
} from "@/app/(app)/news/actions";
import type { NewsFeed, NewsPostView } from "@/server/news/service";

/** Текст записи: абзацы сохраняются, адреса — ссылки (номера заказов здесь не разбираем). */
function NewsBody({ text }: { text: string }) {
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {splitOrderLinks(text).map((segment, index) =>
        segment.type === "link" ? (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:no-underline"
          >
            {segment.text}
          </a>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

function PostForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  initial: { title: string; body: string };
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: { title: string; body: string }) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ title, body });
      }}
    >
      <Input
        value={title}
        maxLength={MAX_NEWS_TITLE}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Заголовок"
        aria-label="Заголовок"
      />
      <Textarea
        value={body}
        maxLength={MAX_NEWS_BODY}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Что нового. Абзацы — пустой строкой, адреса станут ссылками"
        aria-label="Текст"
        className="min-h-28"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || !title.trim() || !body.trim()}>
          <Check />
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onCancel}>
            Отмена
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Post({
  post,
  isNew,
  isAdmin,
  audience,
  run,
  pending,
}: {
  post: NewsPostView;
  isNew: boolean;
  isAdmin: boolean;
  audience: number;
  run: (action: Promise<NewsResult>, onSuccess?: () => void) => void;
  pending: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <article className="flex flex-col gap-2 rounded-lg border p-4">
      {editing ? (
        <PostForm
          initial={{ title: post.title, body: post.body }}
          submitLabel="Сохранить"
          pending={pending}
          onSubmit={(values) => run(updateNewsAction(post.id, values), () => setEditing(false))}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <header className="flex flex-wrap items-center gap-2">
            <h2 className="font-heading font-medium">{post.title}</h2>
            {isNew ? <Badge>Новое</Badge> : null}
            <span className="text-muted-foreground text-xs">
              {formatMoscowDate(new Date(post.publishedAt))}
              {post.authorName ? ` · ${post.authorName}` : ""}
            </span>
            {isAdmin ? (
              <span className="ml-auto flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Исправить запись"
                  disabled={pending}
                  onClick={() => setEditing(true)}
                >
                  <Pencil />
                </Button>
                {confirmDelete ? (
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground text-xs">Удалить?</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(deleteNewsAction(post.id))}
                    >
                      Да
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                      Нет
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="destructive"
                    size="icon-xs"
                    aria-label="Удалить запись"
                    disabled={pending}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </span>
            ) : null}
          </header>
          <NewsBody text={post.body} />
          {post.readers ? (
            // Статус прочтения — администратору: сколько сотрудников уже видели запись и кто именно
            <p
              className="text-muted-foreground text-xs"
              title={post.readers.length ? post.readers.join(", ") : "Пока никто"}
            >
              Прочитали: {post.readers.length} из {audience}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}

/**
 * Лента «Новости платформы». Записи, которых сотрудник ещё не видел, помечены «Новое»; страница
 * открылась — они отмечаются прочитанными (значок в меню гаснет), а пометки на этой странице
 * остаются до ухода с неё. Администратор публикует, правит, удаляет и видит, кто прочитал.
 */
export function NewsFeedView({ feed, isAdmin }: { feed: NewsFeed; isAdmin: boolean }) {
  const [pending, startTransition] = useTransition();
  // Что было новым в момент открытия — не пересчитывается, когда сервер отметит записи прочитанными
  const [newIds] = useState(() => new Set(feed.posts.filter((post) => !post.read).map((post) => post.id)));
  const [composerKey, setComposerKey] = useState(0);

  useEffect(() => {
    if (newIds.size > 0) void markNewsReadAction();
  }, [newIds]);

  function run(action: Promise<NewsResult>, onSuccess?: () => void) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) {
        toast.success(result.message);
        onSuccess?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {isAdmin ? (
        <section className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
          <h2 className="font-heading text-sm font-medium">Новая запись</h2>
          <PostForm
            key={composerKey}
            initial={{ title: "", body: "" }}
            submitLabel="Опубликовать"
            pending={pending}
            onSubmit={(values) => run(createNewsAction(values), () => setComposerKey((key) => key + 1))}
          />
        </section>
      ) : null}

      {feed.posts.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          Записей пока нет.
        </p>
      ) : null}
      {feed.posts.map((post) => (
        <Post
          key={post.id}
          post={post}
          isNew={newIds.has(post.id)}
          isAdmin={isAdmin}
          audience={feed.audience}
          run={run}
          pending={pending}
        />
      ))}
    </div>
  );
}
