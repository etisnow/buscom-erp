/**
 * «Комплект на салон» (docs/SITE-PRD.md, экран 03): покупатель выбирает схему салона из справочника
 * ERP («Схемы салонов»), и сайт показывает цену комплекта сидений с выбранными опциями.
 *
 * Опции считаются по-разному. Обычная опция (материал, ремень, столик…) ставится на каждое сиденье
 * схемы. «Подлокотник» — только на столько сидений, сколько подлокотников в схеме (`armrests`), а
 * «Откидная спинка» и все опции «на спинку» (сетка на спинку, столик на спинку…) — на столько, сколько в
 * схеме откидных сидений (`reclinerBacks`), а не на все места. Какая опция чем является, определяется по
 * названию группы опций товара. Обязательная группа всегда на всех сиденьях: без неё сиденье не собрать.
 *
 * Корзина считает цену на сервере по позициям «товар + варианты + количество», поэтому комплект
 * раскладывается на несколько позиций: сиденья с подлокотником, без него и т. д. Итог позиций
 * равен цене комплекта — это проверяют тесты.
 */

export type KitLayout = { id: string; name: string; seats: number; armrests: number; reclinerBacks: number };

export type KitGroup = {
  id: string;
  name: string;
  required: boolean;
  values: { id: string; priceDeltaKopecks: number }[];
};

/** Что опция делает с комплектом: на все сиденья, только на подлокотники или только на откидные спинки */
export type KitFeature = "seat" | "armrest" | "recliner";

const ARMREST = /подлокотник/i;
/** «Откидная спинка» и всё, что крепится «на спинку» (сетка, столик…): ставится только на откидные сиденья схемы */
const RECLINER = /откидн\S*\s+спинк|на\s+спинк/i;

export function kitFeatureOf(group: { name: string; required: boolean }): KitFeature {
  if (group.required) return "seat";
  if (ARMREST.test(group.name)) return "armrest";
  if (RECLINER.test(group.name)) return "recliner";
  return "seat";
}

/** Сколько сидений схемы получают опцию этого вида */
export function kitCount(feature: KitFeature, layout: KitLayout): number {
  const count = feature === "armrest" ? layout.armrests : feature === "recliner" ? layout.reclinerBacks : layout.seats;
  return Math.max(0, Math.min(layout.seats, count));
}

/** Выбор покупателя: id группы → id выбранного варианта (нет записи — опция не выбрана) */
export type KitSelection = Record<string, string>;

function selectedDelta(group: KitGroup, selection: KitSelection): number {
  return group.values.find((value) => value.id === selection[group.id])?.priceDeltaKopecks ?? 0;
}

/** Цена комплекта: базовая цена и обычные опции — на каждое сиденье, подлокотники и спинки — на их число в схеме. */
export function kitTotal(
  basePriceKopecks: number,
  groups: readonly KitGroup[],
  selection: KitSelection,
  layout: KitLayout,
): number {
  return (
    basePriceKopecks * layout.seats +
    groups.reduce((sum, group) => sum + selectedDelta(group, selection) * kitCount(kitFeatureOf(group), layout), 0)
  );
}

export type KitLine = { valueIds: string[]; quantity: number };

/**
 * Комплект — позициями корзины. Сиденья с подлокотником и с откидной спинкой «вложены»:
 * первые N сидений получают подлокотник, первые M — спинку, так позиций получается меньше всего
 * (сиденья с обоими, с одним, без опций). Сумма позиций совпадает с `kitTotal`.
 */
export function kitLines(groups: readonly KitGroup[], selection: KitSelection, layout: KitLayout): KitLine[] {
  const base: string[] = [];
  const partial: { valueId: string; count: number }[] = [];
  for (const group of groups) {
    const valueId = selection[group.id];
    if (!valueId || !group.values.some((value) => value.id === valueId)) continue;
    const count = kitCount(kitFeatureOf(group), layout);
    if (count >= layout.seats) base.push(valueId);
    else if (count > 0) partial.push({ valueId, count });
  }

  // Границы участков: на каждом участке у сидений один и тот же набор частичных опций
  const bounds = [...new Set([0, layout.seats, ...partial.map((item) => item.count)])].sort((a, b) => a - b);
  const lines: KitLine[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = bounds[i];
    const quantity = bounds[i + 1] - from;
    if (quantity <= 0) continue;
    const extra = partial.filter((item) => item.count > from).map((item) => item.valueId);
    lines.push({ valueIds: [...base, ...extra], quantity });
  }
  return lines;
}
