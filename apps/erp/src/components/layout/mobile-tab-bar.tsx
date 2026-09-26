"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { ICONS, type NavItem } from "@/components/layout/app-sidebar";
import { useLiveCount } from "@/components/layout/use-live-count";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/** Разделы, которые с телефона открывают чаще всего; остальное — в «Ещё» (шторка меню). */
const TAB_HREFS = ["/orders", "/customers", "/chat"];

/**
 * Карточка заказа прячет нижнее меню: внизу у неё своя панель действий
 * (как в приложениях — на вложенном экране вкладки уступают место действиям).
 */
const HIDDEN_ON = /^\/orders\/\d+$/;

function ChatCount({ url, initial }: { url: string; initial: number }) {
  const count = useLiveCount(url, initial);
  return count ? (
    <span className="bg-primary text-primary-foreground absolute -top-1 left-1/2 ml-1.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium">
      {count}
    </span>
  ) : null;
}

/** Нижнее меню на телефоне. Рядом — пустой блок той же высоты, чтобы низ страницы не прятался под меню. */
export function MobileTabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  if (HIDDEN_ON.test(pathname)) return null;

  const tabs = TAB_HREFS.map((href) => items.find((item) => item.href === href)).filter(
    (item): item is NavItem => item !== undefined,
  );
  const tabClass =
    "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground";

  return (
    <>
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] shrink-0 md:hidden" />
      <nav
        aria-label="Разделы"
        className="bg-background/95 fixed inset-x-0 bottom-0 z-30 flex border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {tabs.map((item) => {
          const Icon = ICONS[item.icon];
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(tabClass, active && "text-primary font-medium")}
            >
              <span className="relative">
                <Icon className="size-5" />
                {item.liveBadgeUrl ? <ChatCount url={item.liveBadgeUrl} initial={item.badge ?? 0} /> : null}
              </span>
              {item.label}
            </Link>
          );
        })}
        <button type="button" className={tabClass} onClick={() => setOpenMobile(true)}>
          <Menu className="size-5" />
          Ещё
        </button>
      </nav>
    </>
  );
}
