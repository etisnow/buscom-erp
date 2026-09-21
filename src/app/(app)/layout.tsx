import { Suspense } from "react";
import { AppSidebar, type NavItem } from "@/components/layout/app-sidebar";
import { OrderSearch } from "@/components/layout/order-search";
import { UserMenu } from "@/components/layout/user-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ADMIN_SECTION_ROLES, hasRole, roleLabel } from "@/domain/user/role";
import { requireUser } from "@/server/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  // Меню собирается по правам роли (PRD, «Карта экранов»).
  const items: NavItem[] = [
    { href: "/orders", label: "Заказы", icon: "orders" },
    { href: "/customers", label: "Клиенты", icon: "customers" },
    { href: "/products", label: "Товары", icon: "products" },
    { href: "/suppliers", label: "Поставщики", icon: "suppliers" },
  ];
  if (hasRole(user.role, ADMIN_SECTION_ROLES)) {
    items.push({ href: "/admin", label: "Администрирование", icon: "admin" });
  }

  return (
    <SidebarProvider>
      <AppSidebar items={items} />
      <SidebarInset>
        <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <Suspense fallback={null}>
            <OrderSearch />
          </Suspense>
          <div className="ml-auto">
            <UserMenu name={user.name} email={user.email} role={roleLabel(user.role)} />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
