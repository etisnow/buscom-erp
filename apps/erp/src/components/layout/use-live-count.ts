"use client";

import { useEffect, useState } from "react";
import { CHAT_UNREAD_EVENT } from "@/components/chat/events";

/** Раз в столько значок спрашивает число непрочитанных. */
const LIVE_COUNT_MS = 20_000;

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Число на значке приложения (главный экран телефона, Android и iOS 16.4+). */
function setAppBadge(count: number): void {
  const nav = navigator as BadgeNavigator;
  // Браузер без поддержки или вкладка без разрешения на уведомления — молча пропускаем
  const done = count ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
  void done?.catch(() => {});
}

/**
 * Число непрочитанных в чате, которое обновляется само: опрос, пока вкладка видна,
 * и событие CHAT_UNREAD_EVENT от ленты чата — значок гаснет сразу, как ленту посмотрели.
 * Заодно ставит число на значок приложения.
 */
export function useLiveCount(url: string, initial: number): number {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) setCount(((await response.json()) as { count: number }).count);
      } catch {
        // Сеть моргнула — спросим в следующий раз.
      }
    };
    const onUnread = (event: Event) => setCount((event as CustomEvent<number>).detail);
    const timer = setInterval(() => void refresh(), LIVE_COUNT_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(CHAT_UNREAD_EVENT, onUnread);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(CHAT_UNREAD_EVENT, onUnread);
    };
  }, [url]);

  useEffect(() => setAppBadge(count), [count]);

  return count;
}
