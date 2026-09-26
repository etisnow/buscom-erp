import Link from "next/link";
import { getCategoryTree } from "@/server/catalog";

/** Строка разделов каталога под шапкой. Мега-меню макета — вместе с дизайном главной. */
export async function CatalogNav() {
  const tree = await getCategoryTree();
  return (
    <nav aria-label="Каталог" className="border-line border-b bg-white">
      <ul className="mx-auto flex max-w-7xl gap-6 overflow-x-auto px-4 py-3 text-sm font-medium whitespace-nowrap">
        {tree.map((category) => (
          <li key={category.id}>
            <Link href={`/${category.slug}`} className="hover:text-brand">
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
