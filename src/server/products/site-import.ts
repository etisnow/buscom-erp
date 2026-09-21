import "server-only";
import { z } from "zod";
import type { OptionGroupDraft } from "@/domain/product/options";
import { assignSkus, uniqueOptionNames, type SiteOptionGroup } from "@/domain/product/site-catalog";
import { db } from "@/server/db";
import { replaceProductOptions } from "@/server/products/service";

const siteOptionGroupSchema = z.object({
  externalId: z.string(),
  name: z.string().min(1),
  required: z.boolean(),
  values: z.array(z.object({ externalId: z.string(), name: z.string().min(1), priceDeltaKopecks: z.number().int() })),
});

/** Строка файла `misc/site-products.json`, который пишет `pnpm fetch:site-products`. */
export const siteProductRowSchema = z.object({
  externalId: z.string().regex(/^\d+$/),
  url: z.string(),
  name: z.string().min(1),
  sku: z.string(),
  priceKopecks: z.number().int().min(0),
  isActive: z.boolean(),
  manufacturer: z.string().nullable(),
  category: z.string().nullable(),
  // Файлы, выгруженные до переноса опций, их не содержат — считаем, что опций нет.
  options: z.array(siteOptionGroupSchema).default([]),
  // Картинки (главная первой); в ранних выгрузках их нет.
  images: z.array(z.object({ url: z.string().url(), thumbUrl: z.string().url().nullable() })).default([]),
});

export type SiteProductRow = z.input<typeof siteProductRowSchema>;

export type SiteImportReport = {
  всего: number;
  создано: number;
  обновлено: number;
  безИзменений: number;
  /** Товары, у которых опции разошлись с сайтом и переписаны (входят в «создано» и «обновлено») */
  сОпциями: number;
  /** Артикул на сайте повторяется или занят — в ERP ушёл с суффиксом */
  артикулИзменён: { externalId: string; name: string; sku: string }[];
};

type ExistingOption = {
  id: string;
  externalId: string | null;
  name: string;
  required: boolean;
  values: { id: string; externalId: string | null; name: string; priceDeltaKopecks: number }[];
};

/**
 * Опции сайта → черновик для `replaceProductOptions`. Группы и варианты
 * сопоставляются с уже перенесёнными по id сайта: правятся на месте, а не
 * пересоздаются. Опции, заведённые в ERP руками, у товара с сайта будут заменены —
 * для таких товаров источник правды сайт.
 */
function toDrafts(site: SiteOptionGroup[], existing: ExistingOption[]): OptionGroupDraft[] {
  return uniqueOptionNames(site).map((group) => {
    const current = existing.find((item) => item.externalId === group.externalId);
    return {
      id: current?.id,
      externalId: group.externalId,
      name: group.name,
      required: group.required,
      values: group.values.map((value) => ({
        id: current?.values.find((item) => item.externalId === value.externalId)?.id,
        externalId: value.externalId,
        name: value.name,
        priceDeltaKopecks: value.priceDeltaKopecks,
      })),
    };
  });
}

/** Совпадают ли опции в ERP с сайтом — по составу, порядку, названиям и надбавкам. */
function sameOptions(site: SiteOptionGroup[], existing: ExistingOption[]): boolean {
  const shape = (groups: { externalId: string | null; name: string; required: boolean; values: object[] }[]) =>
    JSON.stringify(
      groups.map((group) => ({
        externalId: group.externalId,
        name: group.name,
        required: group.required,
        values: group.values.map((value) => {
          const { externalId, name, priceDeltaKopecks } = value as {
            externalId: string | null;
            name: string;
            priceDeltaKopecks: number;
          };
          return { externalId, name, priceDeltaKopecks };
        }),
      })),
    );
  return shape(uniqueOptionNames(site)) === shape(existing);
}

/**
 * Перенос каталога сайта в ERP. Ключ повторного прогона — `Product.externalId`
 * (`product_id` на сайте). Каталог синхронизируется с сайта (PRD, M3), поэтому
 * повторный прогон обновляет название, артикул, категорию, цену и опции по сайту.
 * Поставщиков, закупочные цены и совместимость не трогает — их на сайте нет,
 * они ведутся в ERP. Позиции оформленных заказов не меняются: там снимок.
 */
export async function importSiteProducts(
  input: SiteProductRow[],
  options: { dryRun?: boolean } = {},
): Promise<SiteImportReport> {
  const rows = input.map((row) => siteProductRowSchema.parse(row));
  const report: SiteImportReport = {
    всего: rows.length,
    создано: 0,
    обновлено: 0,
    безИзменений: 0,
    сОпциями: 0,
    артикулИзменён: [],
  };

  const existing = await db.product.findMany({
    select: {
      id: true,
      sku: true,
      externalId: true,
      name: true,
      category: true,
      priceKopecks: true,
      isActive: true,
      options: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          externalId: true,
          name: true,
          required: true,
          values: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, externalId: true, name: true, priceDeltaKopecks: true },
          },
        },
      },
    },
  });
  const byExternalId = new Map(existing.filter((item) => item.externalId).map((item) => [item.externalId, item]));
  const siteIds = new Set(rows.map((row) => row.externalId));
  // Артикулы товаров не с сайта (демо-каталог, заведённые руками) — их не занимаем.
  const taken = new Set(
    existing.filter((item) => !item.externalId || !siteIds.has(item.externalId)).map((item) => item.sku),
  );
  const skus = assignSkus(rows, taken);

  for (const row of rows) {
    const sku = skus.get(row.externalId) as string;
    if (sku !== row.sku) report.артикулИзменён.push({ externalId: row.externalId, name: row.name, sku });

    const data = {
      sku,
      name: row.name,
      category: row.category,
      priceKopecks: row.priceKopecks,
      isActive: row.isActive,
    };
    const current = byExternalId.get(row.externalId);

    if (!current) {
      report.создано += 1;
      if (row.options.length > 0) report.сОпциями += 1;
      if (!options.dryRun) {
        await db.$transaction(async (tx) => {
          const created = await tx.product.create({
            data: { ...data, externalId: row.externalId, compatibility: [] },
            select: { id: true },
          });
          if (row.options.length > 0) await replaceProductOptions(tx, created.id, toDrafts(row.options, []));
        });
      }
      continue;
    }

    const optionsChanged = !sameOptions(row.options, current.options);
    const changed =
      optionsChanged ||
      current.sku !== data.sku ||
      current.name !== data.name ||
      current.category !== data.category ||
      current.priceKopecks !== data.priceKopecks ||
      current.isActive !== data.isActive;
    if (!changed) {
      report.безИзменений += 1;
      continue;
    }

    report.обновлено += 1;
    if (optionsChanged) report.сОпциями += 1;
    if (!options.dryRun) {
      await db.$transaction(async (tx) => {
        await tx.product.update({ where: { id: current.id }, data });
        if (optionsChanged) await replaceProductOptions(tx, current.id, toDrafts(row.options, current.options));
      });
    }
  }

  return report;
}
