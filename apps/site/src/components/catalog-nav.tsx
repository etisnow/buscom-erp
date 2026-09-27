import Link from "next/link";
import { CatalogMenu } from "@/components/catalog-menu";
import { getCategoryTree } from "@/server/catalog";

/** Строка каталога под шапкой: кнопка мега-меню и разделы ссылками. */
export async function CatalogNav() {
  const tree = await getCategoryTree();
  return (
    <nav aria-label="Каталог" className="border-line relative border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-2 text-sm font-medium">
        <CatalogMenu tree={tree} />
        <ul className="flex gap-6 overflow-x-auto whitespace-nowrap">
          {tree.map((category) => (
            <li key={category.id}>
              <Link href={`/${category.slug}`} className="hover:text-brand">
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
