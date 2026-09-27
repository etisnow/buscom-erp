import "server-only";
import { compatibilityHints, type CompatibilityHints } from "@buscom/domain/product/compatibility-hints";
import { db } from "@/server/db";
import { getCarModels } from "@/server/settings/service";

/**
 * Разбор совместимости (docs/SITE-PLAN.md, этап 7): товары в продаже без моделей,
 * у которых название или описание подсказывает модели. Решает менеджер — здесь
 * только подсказка (packages/domain/src/product/compatibility-hints.ts).
 */
export type CompatibilityReviewRow = CompatibilityHints & { id: string; sku: string; name: string };

export async function listCompatibilityReview(): Promise<{ rows: CompatibilityReviewRow[]; withoutModels: number }> {
  const [models, products] = await Promise.all([
    getCarModels(),
    db.product.findMany({
      where: { isActive: true, compatibility: { isEmpty: true } },
      orderBy: { name: "asc" },
      select: { id: true, sku: true, name: true, description: true },
    }),
  ]);
  const rows = products
    .map(({ description, ...product }) => ({
      ...product,
      ...compatibilityHints(`${product.name} ${description ?? ""}`, models),
    }))
    .filter((row) => row.suggested.length > 0 || row.unclear.length > 0)
    // Сначала те, где подсказка однозначна: их можно принять не читая описание
    .sort((a, b) => Number(b.suggested.length > 0) - Number(a.suggested.length > 0));
  return { rows, withoutModels: products.length };
}
