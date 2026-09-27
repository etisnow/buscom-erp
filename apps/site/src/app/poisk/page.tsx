import type { Metadata } from "next";
import Link from "next/link";
import { matchesTerms, searchProducts, searchTerms } from "@buscom/domain/site/search";
import { ProductCard } from "@/components/catalog/product-card";
import { COMPANY } from "@/config/company";
import { getCategoryTree, getSearchIndex, type MenuCategory } from "@/server/catalog";

// Результаты поиска не индексируются: у каждой выдачи свой адрес, а страницы товаров и так в индексе
export const metadata: Metadata = {
  title: "Поиск по каталогу",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

const flatten = (nodes: MenuCategory[]): MenuCategory[] => nodes.flatMap((node) => [node, ...flatten(node.children)]);

export default async function SearchPage({ searchParams }: PageProps<"/poisk">) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q)?.trim() ?? "";
  const terms = searchTerms(query);
  const [products, tree] = await Promise.all([getSearchIndex(), getCategoryTree()]);
  const found = searchProducts(products, query);
  // Категории — если в их названии нашлись все слова: «люки» ведёт сразу в раздел
  const categories = terms.length > 0 ? flatten(tree).filter((category) => matchesTerms(category.name, terms)) : [];

  return (
    <section>
      <h1 className="text-2xl font-bold md:text-3xl">{query ? `Поиск: «${query}»` : "Поиск по каталогу"}</h1>

      {categories.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                href={`/${category.slug}`}
                className="border-line hover:border-brand hover:text-brand inline-flex items-center gap-2 rounded-md border bg-white px-4 py-2"
              >
                {category.name}
                <span className="text-subtle text-sm">{category.productCount}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {terms.length === 0 ? (
        <p className="text-ink-2 mt-4">Введите название товара или его код в строке поиска.</p>
      ) : found.length > 0 ? (
        <>
          <p className="text-muted mt-4 text-sm">Найдено товаров: {found.length}</p>
          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {found.map((product, index) => (
              <ProductCard key={product.id} product={product} eager={index < 4} priority={index === 0} />
            ))}
          </div>
        </>
      ) : (
        <p className="text-ink-2 mt-4">
          Ничего не нашлось. Проверьте написание или спросите нас: {COMPANY.phone.display}, Max {COMPANY.max.display}.
        </p>
      )}
    </section>
  );
}
