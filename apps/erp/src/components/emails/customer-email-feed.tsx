"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { loadOlderEmailsAction, markEmailsReadAction } from "@/app/(app)/mail/actions";
import { EmailMessage, type EmailView } from "./email-thread";

/**
 * Лента переписки с клиентом в заказе: сначала последние 10 писем, прокрученные
 * к самым свежим; доходишь до верха — подгружаются следующие 10 более старых, а
 * место прокрутки остаётся на том же письме. Пересоздаётся, когда сервер
 * присылает новый набор (после отправки письма), — родитель задаёт `key`.
 */
export function CustomerEmailFeed({
  customerId,
  initial,
  total,
}: {
  customerId: string;
  initial: EmailView[];
  total: number;
}) {
  const [items, setItems] = useState(initial);
  const [hasMore, setHasMore] = useState(total > initial.length);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const busy = useRef(false);
  /** Расстояние от низа до текущей прокрутки — чтобы после подгрузки сверху не прыгнуть */
  const keepFromBottom = useRef<number | null>(null);

  // Открыли — показываем самые свежие письма
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, []);

  // Подгрузили старые сверху — возвращаем прокрутку на то же письмо
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (box && keepFromBottom.current !== null) {
      box.scrollTop = box.scrollHeight - keepFromBottom.current;
      keepFromBottom.current = null;
    }
  }, [items]);

  const loadOlder = useCallback(async () => {
    const first = items[0];
    const box = boxRef.current;
    if (busy.current || !first || !box) return;
    busy.current = true;
    setLoading(true);
    try {
      const result = await loadOlderEmailsAction(customerId, {
        sentAt: new Date(first.sentAt).toISOString(),
        id: first.id,
      });
      keepFromBottom.current = box.scrollHeight - box.scrollTop;
      setItems((current) => [...result.items, ...current]);
      setHasMore(result.hasMore);
      const unread = result.items.filter((email) => email.unread).map((email) => email.id);
      if (unread.length) void markEmailsReadAction(unread);
    } catch {
      toast.error("Не удалось подгрузить письма");
      setHasMore(false);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, [customerId, items]);

  // Верх ленты показался — подгружаем. Если писем мало и прокрутки нет, лента
  // сама дозаполнится, пока не станет прокручиваемой или письма не кончатся.
  useEffect(() => {
    const box = boxRef.current;
    const top = topRef.current;
    if (!box || !top || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadOlder();
      },
      { root: box, rootMargin: "120px 0px 0px 0px" },
    );
    observer.observe(top);
    return () => observer.disconnect();
  }, [hasMore, loadOlder]);

  return (
    <div ref={boxRef} className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto">
      <div ref={topRef} className="text-muted-foreground shrink-0 py-1 text-center text-xs">
        {hasMore
          ? loading
            ? "Подгружаю более старые письма…"
            : "Прокрутите вверх — подгрузятся более старые"
          : items.length < total
            ? ""
            : "Это начало переписки"}
      </div>
      {items.map((email) => (
        <EmailMessage key={email.id} email={email} />
      ))}
    </div>
  );
}
