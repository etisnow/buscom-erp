import { Suspense } from "react";
import Link from "next/link";
import { CartLink } from "@/components/cart/cart-link";
import { CatalogMenu } from "@/components/catalog-menu";
import { Logo } from "@/components/logo";
import { SearchBox, SearchForm } from "@/components/search-box";
import { COMPANY } from "@/config/company";
import { getCategoryTree } from "@/server/catalog";

/** Разделы меню MVP. Переоборудование и акции — после запуска (решение владельца 26.09.2026). */
const NAV = [
  { href: "/oplata-dostavka", label: "Доставка и оплата" },
  { href: "/kontakty", label: "Контакты" },
] as const;

/**
 * Шапка по макету: служебная строка, строка с логотипом, каталогом, поиском,
 * телефоном и корзиной, под ней — разделы каталога. На телефоне — логотип,
 * Max и корзина, поиск строкой ниже; каталог открывается из нижней панели.
 */
export async function SiteHeader() {
  const tree = await getCategoryTree();
  return (
    <header className="relative z-30 bg-white">
      <div className="border-surface-2 text-muted hidden border-b text-[13px] md:block">
        <div className="wrap flex h-9 items-center justify-between gap-4">
          <span>
            {COMPANY.warehouse.city} · {COMPANY.delivery}
          </span>
          <nav aria-label="Информация" className="flex gap-7">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-brand">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
      <div className="border-line border-b">
        <div className="wrap flex flex-wrap items-center gap-x-3 gap-y-3 py-3 lg:h-20 lg:flex-nowrap lg:gap-x-5 lg:py-0">
          <div className="mr-auto lg:mr-3">
            <Logo />
          </div>
          <CatalogMenu tree={tree} />
          {/* Suspense — useSearchParams в поле поиска; до гидратации — та же форма пустой */}
          <Suspense fallback={<SearchForm />}>
            <SearchBox />
          </Suspense>
          <div className="hidden flex-col items-end leading-[1.35] lg:flex">
            <a href={COMPANY.phone.href} className="hover:text-brand font-semibold whitespace-nowrap">
              {COMPANY.phone.display}
            </a>
            <span className="text-brand text-[13px] font-medium whitespace-nowrap">Max: {COMPANY.max.display}</span>
          </div>
          <Link
            href="/kontakty"
            className="bg-brand-soft text-brand flex size-11 items-center justify-center rounded-[10px] text-xs font-bold lg:hidden"
          >
            Max
          </Link>
          <CartLink />
        </div>
      </div>
      <nav aria-label="Разделы каталога" className="border-line hidden border-b md:block">
        <ul className="wrap flex h-12 items-center gap-8 overflow-x-auto text-[15px] font-medium whitespace-nowrap">
          {tree.map((category) => (
            <li key={category.id}>
              <Link href={`/${category.slug}`} className="hover:text-brand">
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
