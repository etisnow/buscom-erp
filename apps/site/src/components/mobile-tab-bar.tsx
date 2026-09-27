"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CartIcon, useCartCount } from "@/components/cart/cart-link";
import { CatalogToggle } from "@/components/catalog-menu";

/**
 * Нижняя панель на телефоне (макет, мобильные экраны). В макете четвёртая кнопка —
 * «Профиль», но личного кабинета в MVP нет — на её месте «Контакты».
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const count = useCartCount();
  const item = "flex flex-1 flex-col items-center gap-1 pt-2 text-[11px]";
  const tone = (active: boolean) => (active ? "text-brand" : "text-muted");
  return (
    <nav
      aria-label="Быстрые ссылки"
      className="border-line fixed inset-x-0 bottom-0 z-50 flex h-16 border-t bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Link href="/" className={`${item} ${tone(pathname === "/")}`}>
        <Glyph>
          <path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z" />
        </Glyph>
        Главная
      </Link>
      <CatalogToggle className={`${item} text-muted`}>
        <Glyph>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </Glyph>
        Каталог
      </CatalogToggle>
      <Link href="/korzina" className={`${item} ${tone(pathname === "/korzina")}`}>
        <span className="flex h-6 items-center">
          <CartIcon count={count} />
        </span>
        Корзина
      </Link>
      <Link href="/kontakty" className={`${item} ${tone(pathname === "/kontakty")}`}>
        <Glyph>
          <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1" />
        </Glyph>
        Контакты
      </Link>
    </nav>
  );
}

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-6 fill-none stroke-current stroke-2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}
