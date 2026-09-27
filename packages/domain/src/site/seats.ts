/**
 * «Комплект на салон» в карточке (макет, экран 03) — только у пассажирских сидений
 * (решение владельца 28.09.2026). Признака типа у товара нет: пассажирское — это
 * товар раздела «Сиденья для микроавтобусов», кроме водительских, сиденья гида и
 * откидных бортовых — их в салон по одному, а не рядами.
 */
export const PASSENGER_SEATS_CATEGORY = "sidenja-dlya-microavtobusov";

const NOT_PASSENGER = /водител|гида|бортов|откидн/i;

export function isPassengerSeat(product: { name: string; categorySlugs: readonly string[] }): boolean {
  return product.categorySlugs.includes(PASSENGER_SEATS_CATEGORY) && !NOT_PASSENGER.test(product.name);
}

/** Сколько мест предлагаем для комплекта: типовые салоны микроавтобусов */
export const KIT_SEAT_COUNTS = [14, 15, 16, 17] as const;
