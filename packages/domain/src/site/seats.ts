/**
 * «Комплект на салон» в карточке (макет, экран 03) — только у пассажирских сидений
 * (решение владельца 28.09.2026). Признака типа у товара нет: пассажирское — это
 * товар раздела «Сиденья для микроавтобусов», кроме водительских, сиденья гида и
 * откидных бортовых — их в салон по одному, а не рядами; «кресла» тоже исключены (решение владельца 30.09.2026).
 */
export const PASSENGER_SEATS_CATEGORY = "sidenja-dlya-microavtobusov";

const NOT_PASSENGER = /водител|гида|бортов|откидн|кресл/i;

export function isPassengerSeat(product: { name: string; categorySlugs: readonly string[] }): boolean {
  return product.categorySlugs.includes(PASSENGER_SEATS_CATEGORY) && !NOT_PASSENGER.test(product.name);
}

/**
 * Показывать ли «Комплект на салон» у товара. Настройка товара главнее: true — показать,
 * false — скрыть; не задана (null) — автоматически, по правилу пассажирских сидений.
 */
export function showSalonKit(
  setting: boolean | null | undefined,
  product: { name: string; categorySlugs: readonly string[] },
): boolean {
  return setting ?? isPassengerSeat(product);
}
