"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CHAT_UNREAD_EVENT } from "@/components/chat/events";

/**
 * Раз в столько спрашиваем число непрочитанных — и в фоне тоже: значок на вкладке нужен как раз тогда,
 * когда вкладка не на виду. Браузер сам замедляет таймеры фоновых вкладок (примерно до раза в минуту).
 */
const POLL_MS = 30_000;
const SIZE = 64;
const BASE_ICON = "/icons/icon-192.png";

function label(count: number): string {
  return count > 99 ? "99+" : String(count);
}

let baseImage: Promise<HTMLImageElement> | null = null;

function loadBase(): Promise<HTMLImageElement> {
  baseImage ??= new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = BASE_ICON;
  });
  return baseImage;
}

/** Иконка сайта с красным кружком и числом в правом нижнем углу. */
async function drawBadge(count: number): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas недоступен");
  context.drawImage(await loadBase(), 0, 0, SIZE, SIZE);

  const text = label(count);
  // Кружок, а для «10» и больше — скруглённая плашка шире: число должно помещаться
  const height = 38;
  const width = text.length === 1 ? height : text.length === 2 ? 46 : 56;
  const x = SIZE - width - 1;
  const y = SIZE - height - 1;
  context.fillStyle = "#dc2626";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(x, y, width, height, height / 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = `bold ${text.length === 1 ? 29 : text.length === 2 ? 26 : 21}px system-ui, sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, x + width / 2, y + height / 2 + 1);
  return canvas.toDataURL("image/png");
}

function iconLinks(): HTMLLinkElement[] {
  return [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')];
}

/**
 * Число непрочитанных в чате на иконке вкладки браузера. Свой опрос (а не хук меню): вкладка в фоне
 * тоже должна показывать новые сообщения. Ничего не рисует на странице. Прежние адреса иконок
 * запоминаются и возвращаются, когда непрочитанных нет.
 */
export function FaviconBadge({ url, initial }: { url: string; initial: number }) {
  const [count, setCount] = useState(initial);
  // Навигация может заново выставить иконки страницы — после неё значок рисуем снова
  const pathname = usePathname();

  useEffect(() => {
    const refresh = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) setCount(((await response.json()) as { count: number }).count);
      } catch {
        // Сеть моргнула — спросим в следующий раз
      }
    };
    const onUnread = (event: Event) => setCount((event as CustomEvent<number>).detail);
    const timer = setInterval(() => void refresh(), POLL_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener(CHAT_UNREAD_EVENT, onUnread);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener(CHAT_UNREAD_EVENT, onUnread);
    };
  }, [url]);

  useEffect(() => {
    let cancelled = false;
    const apply = async () => {
      const links = iconLinks();
      for (const link of links) link.dataset.originalHref ??= link.href;

      if (count <= 0) {
        for (const link of links) if (link.dataset.originalHref) link.href = link.dataset.originalHref;
        return;
      }
      try {
        const badge = await drawBadge(count);
        if (cancelled) return;
        // Иконка должна быть: если страница свою не объявила, заводим
        const targets = iconLinks();
        if (targets.length === 0) {
          const link = document.createElement("link");
          link.rel = "icon";
          document.head.append(link);
          targets.push(link);
        }
        for (const link of targets) {
          link.type = "image/png";
          link.removeAttribute("sizes");
          link.href = badge;
        }
      } catch {
        // Иконка не загрузилась или canvas недоступен — остаётся обычная
      }
    };
    void apply();
    return () => {
      cancelled = true;
    };
  }, [count, pathname]);

  return null;
}
