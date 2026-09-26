import "server-only";
import type { Kopecks } from "@/domain/money";
import { normalizeCompatibility, unknownModels } from "@/domain/product/compatibility";
import { normalizeOptionGroups, type OptionGroupDraft } from "@/domain/product/options";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import type { Tx } from "@/server/orders/internal";
import type { SessionUser } from "@/server/session";

/** Кто правит каталог: цены и карточку — менеджеры и выше (PRD, роли). */
const CATALOG_ROLES = ["MANAGER", "HEAD", "ADMIN"] as const;

/** Поставщик товара и его закупочная цена. Цена продажи — `priceKopecks` товара. */
export type ProductSupplierDraft = {
  supplierId: string;
  purchasePriceKopecks: Kopecks;
  /** Страница товара у поставщика; пустая строка равносильна «нет ссылки» */
  url?: string | null;
  /** Выбранные варианты товара на этой странице; без ссылки не храним */
  variant?: Record<string, string> | null;
  /**
   * Закупка вариантов опций у этого поставщика. Ключ — названия группы и варианта,
   * а не id: у вариантов, добавленных в этой же правке, id ещё нет.
   */
  optionPrices?: ProductOptionPriceDraft[];
};

export type ProductOptionPriceDraft = {
  group: string;
  value: string;
  purchasePriceKopecks: Kopecks;
  variant?: Record<string, string> | null;
};

export type ProductDraft = {
  sku: string;
  name: string;
  /** Описание для карточки; пустая строка — описания нет */
  description?: string | null;
  categoryId?: string | null;
  priceKopecks: Kopecks;
  compatibility?: string[];
  isActive?: boolean;
  /** Полный список поставщиков товара; не задан — привязки не трогаем */
  suppliers?: ProductSupplierDraft[];
  /** Полный список групп опций; не задан — опции не трогаем */
  options?: OptionGroupDraft[];
};

export async function createProduct(draft: ProductDraft, user: SessionUser): Promise<{ id: string }> {
  if (!CATALOG_ROLES.includes(user.role as (typeof CATALOG_ROLES)[number])) {
    throw new ForbiddenError("Заводить товары может менеджер, руководитель или администратор");
  }

  const sku = draft.sku.trim();
  const existing = await db.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing) throw new Error(`Товар с артикулом ${sku} уже есть`);

  return db.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        sku,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        categoryId: draft.categoryId || null,
        priceKopecks: draft.priceKopecks,
        compatibility: await checkCompatibility(tx, draft.compatibility ?? []),
        isActive: draft.isActive ?? true,
      },
      select: { id: true },
    });
    if (draft.suppliers) await replaceProductSuppliers(tx, product.id, draft.suppliers);
    if (draft.options) await replaceProductOptions(tx, product.id, draft.options);
    if (draft.suppliers) await replaceOptionPrices(tx, product.id, draft.suppliers);
    return product;
  });
}

export async function updateProduct(id: string, draft: Partial<ProductDraft>, user: SessionUser): Promise<void> {
  if (!CATALOG_ROLES.includes(user.role as (typeof CATALOG_ROLES)[number])) {
    throw new ForbiddenError("Недостаточно прав, чтобы менять карточку товара");
  }

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        ...(draft.sku !== undefined ? { sku: draft.sku.trim() } : {}),
        ...(draft.name !== undefined ? { name: draft.name.trim() } : {}),
        ...(draft.description !== undefined ? { description: draft.description?.trim() || null } : {}),
        ...(draft.categoryId !== undefined ? { categoryId: draft.categoryId || null } : {}),
        ...(draft.priceKopecks !== undefined ? { priceKopecks: draft.priceKopecks } : {}),
        ...(draft.compatibility !== undefined
          ? { compatibility: await checkCompatibility(tx, draft.compatibility, id) }
          : {}),
        ...(draft.isActive !== undefined ? { isActive: draft.isActive } : {}),
      },
    });
    if (draft.suppliers) await replaceProductSuppliers(tx, id, draft.suppliers);
    if (draft.options) await replaceProductOptions(tx, id, draft.options);
    // После опций: закупки привязываются к вариантам по названию, новым нужен уже их id
    if (draft.suppliers) await replaceOptionPrices(tx, id, draft.suppliers);
  });
}

/**
 * Модели совместимости — только из справочника «Модели авто» (включая выключенные).
 * Названия, которые уже стоят у товара, пропускаются и без справочника: у старых
 * товаров они вводились текстом, и сохранение карточки не должно на них падать.
 */
async function checkCompatibility(tx: Tx, models: string[], productId?: string): Promise<string[]> {
  const dictionary = (
    await tx.dictionaryItem.findMany({
      where: { type: "CAR_MODEL" },
      select: { name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
  ).map((item) => item.name);
  const current = productId
    ? ((await tx.product.findUnique({ where: { id: productId }, select: { compatibility: true } }))?.compatibility ??
      [])
    : [];

  const unknown = unknownModels(models, [...dictionary, ...current]);
  if (unknown.length > 0) {
    throw new Error(`Нет в справочнике моделей авто: ${unknown.join(", ")}`);
  }
  return normalizeCompatibility(models, dictionary);
}

/**
 * Привязки товара к поставщикам заменяются целиком. Позиции уже оформленных
 * заказов это не задевает: закупочная цена в них — снимок.
 */
async function replaceProductSuppliers(tx: Tx, productId: string, suppliers: ProductSupplierDraft[]): Promise<void> {
  const ids = suppliers.map((item) => item.supplierId);
  if (new Set(ids).size !== ids.length) {
    throw new Error("Один поставщик указан у товара дважды");
  }

  await tx.productSupplier.deleteMany({ where: { productId } });
  if (suppliers.length > 0) {
    await tx.productSupplier.createMany({
      data: suppliers.map((item) => ({
        productId,
        supplierId: item.supplierId,
        purchasePriceKopecks: item.purchasePriceKopecks,
        url: item.url?.trim() || null,
        // Выбор вариантов относится к конкретной странице: нет ссылки — нечего и помнить
        variant:
          item.url?.trim() && item.variant && Object.keys(item.variant).length > 0 ? item.variant : Prisma.DbNull,
      })),
    });
  }
}

/**
 * Закупки вариантов опций у поставщиков — полным списком из формы. Привязки к
 * поставщикам только что пересозданы (`replaceProductSuppliers` удаляет пары, и
 * их закупки опций уходят каскадом), поэтому пишем заново всё, что пришло.
 * Вариант, которого в опциях товара нет (удалили в этой же правке), пропускаем.
 */
async function replaceOptionPrices(tx: Tx, productId: string, suppliers: ProductSupplierDraft[]): Promise<void> {
  const groups = await tx.productOption.findMany({
    where: { productId },
    select: { name: true, values: { select: { id: true, name: true } } },
  });
  // Названия уникальны без учёта регистра (normalizeOptionGroups) — по ним и ищем
  const key = (group: string, value: string) =>
    JSON.stringify([group.trim().toLocaleLowerCase("ru"), value.trim().toLocaleLowerCase("ru")]);
  const valueIds = new Map(
    groups.flatMap((group) => group.values.map((value) => [key(group.name, value.name), value.id])),
  );

  await tx.productSupplierOptionPrice.deleteMany({ where: { productId } });
  const data = suppliers.flatMap((supplier) =>
    (supplier.optionPrices ?? []).flatMap((price) => {
      const optionValueId = valueIds.get(key(price.group, price.value));
      if (!optionValueId) return [];
      return [
        {
          productId,
          supplierId: supplier.supplierId,
          optionValueId,
          purchasePriceKopecks: price.purchasePriceKopecks,
          variant: price.variant && Object.keys(price.variant).length > 0 ? price.variant : Prisma.DbNull,
        },
      ];
    }),
  );
  if (data.length > 0) await tx.productSupplierOptionPrice.createMany({ data, skipDuplicates: true });
}

export function canEditCatalog(role: SessionUser["role"]): boolean {
  return CATALOG_ROLES.includes(role as (typeof CATALOG_ROLES)[number]);
}

/**
 * Опции товара заменяются целиком, но по id: существующие группы и варианты
 * правятся на месте, чтобы не терять их `externalId` с сайта. Заказы ссылаются
 * на варианты снимком, поэтому удаление вариантов старые заказы не задевает.
 */
export async function replaceProductOptions(tx: Tx, productId: string, drafts: OptionGroupDraft[]): Promise<void> {
  const groups = normalizeOptionGroups(drafts);

  const existing = await tx.productOption.findMany({
    where: { productId },
    select: { id: true, values: { select: { id: true } } },
  });
  const existingGroupIds = new Set(existing.map((group) => group.id));
  const keptGroupIds = new Set(groups.map((group) => group.id).filter((id): id is string => Boolean(id)));
  for (const id of keptGroupIds) {
    if (!existingGroupIds.has(id)) throw new Error("Группа опций не принадлежит этому товару — обновите страницу");
  }
  await tx.productOption.deleteMany({ where: { productId, id: { notIn: [...keptGroupIds] } } });

  for (const [groupIndex, group] of groups.entries()) {
    const data = {
      name: group.name,
      required: group.required,
      sortOrder: groupIndex,
      ...(group.externalId !== undefined ? { externalId: group.externalId } : {}),
    };
    const optionId = group.id
      ? (await tx.productOption.update({ where: { id: group.id }, data, select: { id: true } })).id
      : (await tx.productOption.create({ data: { ...data, productId }, select: { id: true } })).id;

    const ownValueIds = new Set(existing.find((item) => item.id === optionId)?.values.map((value) => value.id));
    const keptValueIds = group.values.map((value) => value.id).filter((id): id is string => Boolean(id));
    for (const id of keptValueIds) {
      if (!ownValueIds.has(id)) throw new Error("Вариант опции не принадлежит этой группе — обновите страницу");
    }
    await tx.productOptionValue.deleteMany({ where: { optionId, id: { notIn: keptValueIds } } });

    for (const [valueIndex, value] of group.values.entries()) {
      const valueData = {
        name: value.name,
        priceDeltaKopecks: value.priceDeltaKopecks,
        sortOrder: valueIndex,
        ...(value.externalId !== undefined ? { externalId: value.externalId } : {}),
      };
      if (value.id) await tx.productOptionValue.update({ where: { id: value.id }, data: valueData });
      else await tx.productOptionValue.create({ data: { ...valueData, optionId } });
    }
  }
}
