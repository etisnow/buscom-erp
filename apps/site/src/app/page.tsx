import type { Metadata } from "next";
import Link from "next/link";
import { getCategoryTree } from "@/server/catalog";

// Метатеги главной — со старого сайта дословно (docs/site-snapshot/pages.json, «/»)
export const metadata: Metadata = {
  title: { absolute: "Баском. Комплектующие для микроавтобусов" },
  alternates: { canonical: "/" },
};

export const dynamic = "force-dynamic";

/** Главная: разделы каталога. Подбор по модели, хиты и блок цеха из макета — позже (этапы 4 и 7). */
export default async function HomePage() {
  const tree = await getCategoryTree();
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-bold">Комплектующие для микроавтобусов</h1>
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
    </div>
  );
}
