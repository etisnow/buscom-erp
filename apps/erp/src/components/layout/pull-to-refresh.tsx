"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/** На сколько протянуть палец, чтобы обновить. */
const THRESHOLD_PX = 70;
/** Сопротивление: индикатор едет медленнее пальца, как в приложениях. */
const RESISTANCE = 0.5;

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Жест не наш, если под пальцем прокручиваемый блок, который ещё не у верха (лента чата). */
function insideScrolledBox(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight && el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * «Потянуть вниз — обновить» для ERP, открытой значком с главного экрана: у приложения
 * нет своего жеста браузера. В обычной вкладке ничего не делает — там жест есть и так.
 * Обновление — `router.refresh()`: данные страницы с сервера, без перезагрузки и потери ввода.
 */
export function PullToRefresh() {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, startRefresh] = useTransition();
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (!isStandalone()) return;

    const onStart = (event: TouchEvent) => {
      const blocked =
        window.scrollY > 0 ||
        event.touches.length > 1 ||
        insideScrolledBox(event.target) ||
        // Открытое окно или шторка меню — тянут их, а не страницу
        document.querySelector("[data-slot=dialog-content], [data-slot=sheet-content]") !== null;
      start.current = blocked ? null : event.touches[0].clientY;
    };
    const onMove = (event: TouchEvent) => {
      if (start.current === null) return;
      const distance = Math.max(0, (event.touches[0].clientY - start.current) * RESISTANCE);
      pullRef.current = distance;
      setPull(distance);
    };
    const onEnd = () => {
      if (start.current !== null && pullRef.current >= THRESHOLD_PX) startRefresh(() => router.refresh());
      start.current = null;
      pullRef.current = 0;
      setPull(0);
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  if (!pull && !refreshing) return null;
  const ready = pull >= THRESHOLD_PX;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-20 flex justify-center md:hidden"
      style={{ transform: `translateY(${refreshing ? 12 : Math.min(pull, THRESHOLD_PX + 20) - 28}px)` }}
    >
      <span className="bg-background flex size-9 items-center justify-center rounded-full border shadow-sm">
        {refreshing ? (
          <Loader2 className="text-primary size-4 animate-spin" aria-label="Обновляется" />
        ) : (
          <RefreshCw
            className={cn("size-4 transition-transform", ready ? "text-primary rotate-180" : "text-muted-foreground")}
          />
        )}
      </span>
    </div>
  );
}
