import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/config/metadata";
import { ProductCard } from "@/components/catalog/product-card";
import { LeadForm } from "@/components/lead-form";
import { PageText } from "@/components/page-text";
import { getCategoryTree, getHits } from "@/server/catalog";
import { getSitePage } from "@/server/pages";

// Заголовок, метатеги и текст о компании правятся в ERP («Страницы сайта», ключ home);
// исходные — со старого сайта (packages/domain/src/site/pages.ts)
export async function generateMetadata(): Promise<Metadata> {
  const page = await getSitePage("home");
  return pageMetadata({ title: page.metaTitle, description: page.metaDescription || undefined, path: "/" });
}

export const dynamic = "force-dynamic";

/** Главная: разделы каталога, хиты, заявка и текст о компании. Подбор по модели — позже (этап 7). */
export default async function HomePage() {
  const [tree, hits, page] = await Promise.all([getCategoryTree(), getHits(), getSitePage("home")]);
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">{page.title}</h1>
        <p className="text-ink-2 max-w-2xl">
          Сиденья, люки, полки, поручни, подножки, детали салона и кузова. Отправляем транспортными компаниями по
          России, Беларуси, Казахстану и Киргизии.
        </p>
      </section>
      <section>
        <h2 className="mb-4 text-xl font-semibold">Каталог</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tree.map((category) => (
            <div key={category.id} className="border-line rounded-lg border bg-white p-5">
              <Link href={`/${category.slug}`} className="hover:text-brand text-lg font-semibold">
                {category.name} <span className="text-subtle text-sm font-normal">{category.productCount}</span>
              </Link>
              {category.children.length > 0 && (
                <ul className="mt-3 space-y-1 text-sm">
                  {category.children.map((child) => (
                    <li key={child.id}>
                      <Link href={`/${child.slug}`} className="text-ink-2 hover:text-brand">
                        {child.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
      {hits.length > 0 && (
        <section>
          <h2 className="mb-4 text-xl font-semibold">Хиты продаж</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {hits.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
      <section className="bg-brand-soft grid gap-6 rounded-lg p-6 lg:grid-cols-2">
        <div>
          <h2 className="text-xl font-semibold">Обновляете салон целиком?</h2>
          <p className="text-ink-2 mt-2">
            Подберём сиденья, обшивку, пол и свет под вашу модель и посчитаем комплект. Оставьте телефон и опишите
            задачу — перезвоним.
          </p>
        </div>
        <LeadForm kind="salon" submitLabel="Отправить заявку" />
      </section>
      {page.body && (
        <section className="max-w-3xl">
          <PageText text={page.body} />
        </section>
      )}
    </div>
  );
}
