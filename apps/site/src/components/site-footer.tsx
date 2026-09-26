import Link from "next/link";
import { COMPANY } from "@/config/company";

export function SiteFooter() {
  return (
    <footer className="bg-ink text-subtle mt-16 text-sm">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-lg font-bold text-white">{COMPANY.brand}</p>
          <p>Комплектующие для микроавтобусов</p>
          <p>{COMPANY.delivery}</p>
        </div>
        <nav aria-label="Покупателям" className="flex flex-col gap-2">
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
        <address className="space-y-2 not-italic">
          <p className="font-semibold text-white">Контакты</p>
          <p>
            <a href={COMPANY.phone.href} className="hover:text-white">
              {COMPANY.phone.display}
            </a>
          </p>
          <p>Max: {COMPANY.max.display}</p>
          <p>
            <a href={`mailto:${COMPANY.email}`} className="hover:text-white">
              {COMPANY.email}
            </a>
          </p>
          <p>
            Склад: {COMPANY.warehouse.city}, {COMPANY.warehouse.street}
          </p>
          <p>{COMPANY.hours}</p>
        </address>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-4 text-xs">
          © {COMPANY.legalName}, ИНН {COMPANY.inn}, ОГРН {COMPANY.ogrn}
        </p>
      </div>
    </footer>
  );
}
