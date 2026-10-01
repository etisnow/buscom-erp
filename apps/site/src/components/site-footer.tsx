import Link from "next/link";
import { Logo } from "@/components/logo";
import { Messengers } from "@/components/messengers";
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
          <Messengers mono />
          <p className="text-lg font-semibold text-white">{COMPANY.max.display}</p>
          <a href={`mailto:${COMPANY.email}`} className="py-1.5 hover:text-white md:py-0">
            {COMPANY.email}
          </a>
          <p>{COMPANY.hours}</p>
        </address>
        <nav aria-label="Каталог" className="flex flex-col gap-0.5 md:gap-2.5">
          <p className="font-semibold text-white">Каталог</p>
          {tree.map((category) => (
            <Link key={category.id} href={`/${category.slug}`} className="py-1.5 hover:text-white md:py-0">
              {category.name}
            </Link>
          ))}
        </nav>
        <nav aria-label="Покупателям" className="flex flex-col gap-0.5 md:gap-2.5">
          <p className="font-semibold text-white">Покупателям</p>
          <Link href="/status-zakaza" className="py-1.5 hover:text-white md:py-0">
            Проверить статус заказа
          </Link>
          <Link href="/oplata-dostavka" className="py-1.5 hover:text-white md:py-0">
            Доставка и оплата
          </Link>
          <Link href="/kontakty" className="py-1.5 hover:text-white md:py-0">
            Контакты
          </Link>
          <Link href="/privacy" className="py-1.5 hover:text-white md:py-0">
            Политика конфиденциальности
          </Link>
        </nav>
        <div className="flex flex-col gap-0.5 md:gap-2.5">
          <p className="font-semibold text-white">Реквизиты</p>
          <p>Компания «{COMPANY.brand}»</p>
        </div>
        <p className="border-t border-[#2b3130] pt-5 text-xs leading-normal text-[#8d948f] md:col-span-full">
          Информация на сайте носит справочный характер и не является публичной офертой (ст. 437 ГК РФ). ©{" "}
          {COMPANY.brand}, 2016–{new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
