import Link from "next/link";
import { CartLink } from "@/components/cart/cart-link";
import { COMPANY } from "@/config/company";

/** Разделы меню MVP. Переоборудование и акции — после запуска (решение владельца 26.09.2026). */
const NAV = [
  { href: "/oplata-dostavka", label: "Доставка и оплата" },
  { href: "/kontakty", label: "Контакты" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-line border-b bg-white">
      <div className="bg-surface text-muted text-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2">
          <span>
            {COMPANY.warehouse.city} · {COMPANY.delivery}
          </span>
          <nav aria-label="Информация" className="hidden gap-6 md:flex">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-brand">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
        <Link href="/" className="text-brand text-2xl font-bold tracking-tight">
          {COMPANY.brand}
        </Link>
        <p className="text-muted hidden text-sm leading-tight lg:block">
          Комплектующие
          <br />
          для микроавтобусов
        </p>
        {/* Поиск по каталогу появится вместе с каталогом (этап 4) */}
        <div className="grow" />
        <div className="flex flex-col text-right">
          <a href={COMPANY.phone.href} className="hover:text-brand text-lg font-semibold whitespace-nowrap">
            {COMPANY.phone.display}
          </a>
          <span className="text-muted text-sm">Max: {COMPANY.max.display}</span>
        </div>
        <CartLink />
      </div>
    </header>
  );
}
