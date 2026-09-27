import Link from "next/link";
import { Logo } from "@/components/logo";
import { COMPANY } from "@/config/company";
import { getCategoryTree } from "@/server/catalog";

/**
 * Подвал по макету: контакты, разделы каталога, ссылки покупателям, реквизиты.
 * Колонки «Услуги», «Акции» и «Производители» из макета — после запуска
 * (решение владельца 26.09.2026), политика конфиденциальности — к покупателям.
 */
export async function SiteFooter() {
  const tree = await getCategoryTree();
  return (
    <footer className="bg-ink mt-14 pb-16 text-sm text-[#c5cbc6] md:pb-0">
      <div className="wrap grid gap-10 py-12 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <address className="flex flex-col gap-3 not-italic">
          <div className="mb-1">
            <Logo inverse tagline={false} />
          </div>
          <a href={COMPANY.phone.href} className="text-lg font-semibold text-white hover:underline">
            {COMPANY.phone.display}
          </a>
          <p>Max: {COMPANY.max.display}</p>
          <a href={`mailto:${COMPANY.email}`} className="hover:text-white">
            {COMPANY.email}
          </a>
          <p>
            {COMPANY.warehouse.city}, {COMPANY.warehouse.street}
          </p>
          <p>{COMPANY.hours}</p>
        </address>
        <nav aria-label="Каталог" className="flex flex-col gap-2.5">
          <p className="font-semibold text-white">Каталог</p>
          {tree.map((category) => (
            <Link key={category.id} href={`/${category.slug}`} className="hover:text-white">
              {category.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Покупателям" className="flex flex-col gap-2.5">
          <p className="font-semibold text-white">Покупателям</p>
          <Link href="/oplata-dostavka" className="hover:text-white">
            Доставка и оплата
          </Link>
          <Link href="/kontakty" className="hover:text-white">
            Контакты
          </Link>
          <Link href="/privacy" className="hover:text-white">
            Политика конфиденциальности
          </Link>
        </nav>
        <div className="flex flex-col gap-2.5">
          <p className="font-semibold text-white">Реквизиты</p>
          <p>{COMPANY.legalName}</p>
          <p>ИНН {COMPANY.inn}</p>
          <p>ОГРН {COMPANY.ogrn}</p>
        </div>
        <p className="border-t border-[#2b3130] pt-5 text-xs leading-normal text-[#8d948f] md:col-span-full">
          Информация на сайте носит справочный характер и не является публичной офертой (ст. 437 ГК РФ). ©{" "}
          {COMPANY.brand}, 2016–{new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
