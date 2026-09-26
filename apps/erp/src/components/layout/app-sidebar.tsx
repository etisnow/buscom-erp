"use client";

import { ChartColumn, ClipboardList, Mail, Factory, MessagesSquare, Package, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveCount } from "@/components/layout/use-live-count";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export type NavItem = {
  href: string;
  label: string;
  icon: "orders" | "customers" | "products" | "suppliers" | "mail" | "chat" | "analytics" | "admin";
  /** Число рядом с пунктом — непрочитанные письма; 0 не показывается */
  badge?: number;
  /** Значок обновляется сам: адрес, отдающий `{ count }` (непрочитанные в чате) */
  liveBadgeUrl?: string;
};

export const ICONS = {
  orders: ClipboardList,
  customers: Users,
  products: Package,
  suppliers: Factory,
  mail: Mail,
  chat: MessagesSquare,
  analytics: ChartColumn,
  admin: Settings,
} as const;

export function AppSidebar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  // На телефоне меню — шторка поверх страницы: после перехода её закрываем,
  // иначе открытая страница остаётся под меню
  const { setOpenMobile } = useSidebar();
  const closeMobile = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="BusCom ERP">
              <Link href="/orders" onClick={closeMobile}>
                {/* eslint-disable-next-line @next/next/no-img-element -- статичная иконка 96 px, оптимизатор не нужен */}
                <img src="/icons/logo-96.png" alt="" className="size-6 shrink-0 rounded-md" />
                <span className="font-heading text-base font-semibold">BusCom ERP</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const Icon = ICONS[item.icon];
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive} tooltip={item.label}>
                      <Link href={item.href} onClick={closeMobile}>
                        <Icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.liveBadgeUrl ? (
                      <LiveBadge url={item.liveBadgeUrl} initial={item.badge ?? 0} />
                    ) : item.badge ? (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}

/** Значок непрочитанных в чате — число обновляется само (`useLiveCount`). */
function LiveBadge({ url, initial }: { url: string; initial: number }) {
  const count = useLiveCount(url, initial);
  return count ? <SidebarMenuBadge>{count}</SidebarMenuBadge> : null;
}
