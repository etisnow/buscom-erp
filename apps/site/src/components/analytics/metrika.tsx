"use client";

import Script from "next/script";
import { useEffect } from "react";

/**
 * Яндекс.Метрика — тот же счётчик, что у старого сайта (номер от владельца 26.09.2026),
 * с вебвизором и электронной коммерцией (docs/SITE-PRD.md, «Аналитика»).
 *
 * Включается вместе с индексацией (`SITE_INDEXING`): пока сайт живёт на временном
 * адресе, его визиты смешались бы со статистикой работающего старого сайта.
 */
export const METRIKA_ID = 36097845;

type Ym = (id: number, method: string, ...args: unknown[]) => void;

declare global {
  interface Window {
    ym?: Ym;
    dataLayer?: unknown[];
  }
}

/** Цель Метрики: add_to_cart, order_placed, phone_click, max_click. Без счётчика — ничего. */
export function reachGoal(goal: string, params?: Record<string, unknown>) {
  window.ym?.(METRIKA_ID, "reachGoal", goal, params);
}

/** Событие электронной коммерции — в dataLayer, откуда его забирает Метрика. */
export function ecommerce(event: Record<string, unknown>) {
  if (!window.ym) return;
  (window.dataLayer ??= []).push({ ecommerce: { currencyCode: "RUB", ...event } });
}

export function Metrika() {
  // Клик по телефону — цель на всём сайте, без правки каждой ссылки
  useEffect(() => {
    function onClick(event: MouseEvent) {
      const link = (event.target as HTMLElement | null)?.closest("a[href^='tel:']");
      if (link) reachGoal("phone_click");
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <Script id="yandex-metrika" strategy="afterInteractive">
      {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
window.dataLayer=window.dataLayer||[];
ym(${METRIKA_ID},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true,ecommerce:"dataLayer"});`}
    </Script>
  );
}
