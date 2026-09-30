/**
 * Тип сиденья для фильтра в каталоге сайта и блока «Комплект на салон» в карточке (макет, экран 03).
 * Тип задаёт человек в карточке товара в ERP; не задан — определяется автоматически:
 * пассажирское — товар раздела «Сиденья для микроавтобусов», кроме водительских, сиденья гида и
 * откидных бортовых (их в салон по одному, а не рядами) и «кресел» (решения владельца 28–30.09.2026);
 * водительское — товар того же раздела с «водител» в названии. «Универсальное» — только вручную.
 */
export const PASSENGER_SEATS_CATEGORY = "sidenja-dlya-microavtobusov";

export const SEAT_TYPES = ["passenger", "driver", "universal"] as const;
export type SeatType = (typeof SEAT_TYPES)[number];

export const SEAT_TYPE_LABELS: Record<SeatType, string> = {
  passenger: "Пассажирские сиденья",
  driver: "Водительские сиденья",
  universal: "Универсальные сиденья",
};

const NOT_PASSENGER = /водител|гида|бортов|откидн|кресл/i;
const DRIVER = /водител/i;

type SeatProduct = { name: string; categorySlugs: readonly string[] };

export function isPassengerSeat(product: SeatProduct): boolean {
  return product.categorySlugs.includes(PASSENGER_SEATS_CATEGORY) && !NOT_PASSENGER.test(product.name);
}

/** Тип по правилу, без ручной настройки; null — не сиденье или не определить. */
export function autoSeatType(product: SeatProduct): SeatType | null {
  if (!product.categorySlugs.includes(PASSENGER_SEATS_CATEGORY)) return null;
  if (isPassengerSeat(product)) return "passenger";
  return DRIVER.test(product.name) ? "driver" : null;
}

/** Тип сиденья: настройка товара главнее, не задана (null) — по правилу. */
export function resolveSeatType(setting: SeatType | null | undefined, product: SeatProduct): SeatType | null {
  return setting ?? autoSeatType(product);
}

/** Значение из базы или адреса — в тип; всё постороннее — null. */
export function parseSeatType(value: string | null | undefined): SeatType | null {
  return SEAT_TYPES.find((type) => type === value) ?? null;
}

/**
 * Показывать ли «Комплект на салон» у товара. Настройка блока главнее: true — показать,
 * false — скрыть; не задана (null) — у пассажирских сидений.
 */
export function showSalonKit(
  setting: boolean | null | undefined,
  product: SeatProduct & { seatType?: SeatType | null },
): boolean {
  return setting ?? resolveSeatType(product.seatType, product) === "passenger";
}
