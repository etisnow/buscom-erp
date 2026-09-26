/**
 * Опции товара (docs/DECISIONS.md, «Опции товара»). У товара группы опций
 * («Опора», «Ремень», «Выбор стекла»), в группе — варианты с надбавкой к цене.
 * В позиции заказа выбирается не больше одного варианта в группе; в обязательной
 * группе — ровно один. Позиция хранит снимок выбора, как и снимок названия и цены.
 */
import { z } from "zod";
import type { Kopecks } from "../money";

export type OptionValue = { id: string; name: string; priceDeltaKopecks: Kopecks };
export type OptionGroup = { id: string; name: string; required: boolean; values: OptionValue[] };

/** Выбранная опция в позиции заказа — снимок на момент выбора. */
export const orderItemOptionSchema = z.object({
  /** Вариант в каталоге — чтобы при правке позиции показать, что выбрано */
  valueId: z.string(),
  optionName: z.string(),
  valueName: z.string(),
  priceDeltaKopecks: z.number().int(),
});

export type OrderItemOption = z.infer<typeof orderItemOptionSchema>;

export class ProductOptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductOptionError";
  }
}

/**
 * Снимок выбранных опций. Варианты сверяются с опциями товара: чужой вариант,
 * два варианта в одной группе и пропущенная обязательная группа отклоняются.
 */
export function buildOptionSnapshot(
  groups: readonly OptionGroup[],
  selectedValueIds: readonly string[],
  productName = "товар",
): OrderItemOption[] {
  const selected = new Set(selectedValueIds);
  const snapshot: OrderItemOption[] = [];

  for (const group of groups) {
    const chosen = group.values.filter((value) => selected.has(value.id));
    if (chosen.length > 1) {
      throw new ProductOptionError(`У «${productName}» в группе «${group.name}» выбрано больше одного варианта`);
    }
    if (chosen.length === 0) {
      if (group.required) {
        throw new ProductOptionError(`У «${productName}» не выбрана обязательная опция «${group.name}»`);
      }
      continue;
    }
    for (const value of chosen) selected.delete(value.id);
    snapshot.push({
      valueId: chosen[0].id,
      optionName: group.name,
      valueName: chosen[0].name,
      priceDeltaKopecks: chosen[0].priceDeltaKopecks,
    });
  }

  if (selected.size > 0) {
    throw new ProductOptionError(`У «${productName}» выбрана опция, которой у товара нет — обновите страницу`);
  }
  return snapshot;
}

/** Цена позиции по каталогу: базовая цена товара плюс надбавки выбранных опций. */
export function priceWithOptions(basePriceKopecks: Kopecks, options: readonly OrderItemOption[]): Kopecks {
  return options.reduce((sum, option) => sum + option.priceDeltaKopecks, basePriceKopecks);
}

/** Подпись выбора для заказа и счёта: «Опора: Есть; Ремень: Трехточечный». */
export function describeOptions(options: readonly OrderItemOption[]): string {
  return options.map((option) => `${option.optionName}: ${option.valueName}`).join("; ");
}

/** Снимок из Json-поля. Битые и старые записи не роняют карточку — отдаём пустой список. */
export function parseOrderItemOptions(value: unknown): OrderItemOption[] {
  const parsed = z.array(orderItemOptionSchema).safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** Группа опций из формы товара: у существующих есть id, у новых нет. */
export type OptionGroupDraft = {
  id?: string;
  /** ID на сайте — у опций, перенесённых импортом */
  externalId?: string | null;
  name: string;
  required: boolean;
  values: { id?: string; externalId?: string | null; name: string; priceDeltaKopecks: Kopecks }[];
};

/**
 * Проверка опций перед сохранением: пустые названия и повторы отклоняем, а не
 * чистим молча. Группа без вариантов бессмысленна — выбрать в ней нечего.
 */
export function normalizeOptionGroups(groups: readonly OptionGroupDraft[]): OptionGroupDraft[] {
  const seenGroups = new Set<string>();

  return groups.map((group) => {
    const name = group.name.trim();
    if (!name) throw new ProductOptionError("У каждой группы опций должно быть название");
    const groupKey = name.toLocaleLowerCase("ru");
    if (seenGroups.has(groupKey)) throw new ProductOptionError(`Группа опций «${name}» повторяется`);
    seenGroups.add(groupKey);

    if (group.values.length === 0) throw new ProductOptionError(`В группе «${name}» нет ни одного варианта`);

    const seenValues = new Set<string>();
    const values = group.values.map((value) => {
      const valueName = value.name.trim();
      if (!valueName) throw new ProductOptionError(`В группе «${name}» есть вариант без названия`);
      const valueKey = valueName.toLocaleLowerCase("ru");
      if (seenValues.has(valueKey))
        throw new ProductOptionError(`В группе «${name}» вариант «${valueName}» повторяется`);
      seenValues.add(valueKey);
      if (!Number.isInteger(value.priceDeltaKopecks)) {
        throw new ProductOptionError(`Надбавка у варианта «${valueName}» — не сумма в копейках`);
      }
      return { ...value, name: valueName };
    });

    return { ...group, name, values };
  });
}
