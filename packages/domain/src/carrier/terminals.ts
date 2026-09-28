/**
 * Пункты транспортных компаний — общий вид для всех перевозчиков (docs/SITE-PLAN.md,
 * этап 5а). Разбор ответа конкретной ТК приводит к нему, дальше код одинаков.
 */

export type CarrierTerminalRecord = {
  /** Код пункта у перевозчика */
  externalId: string;
  cityName: string;
  cityCode: string | null;
  name: string;
  address: string;
  fullAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  /** График выдачи груза текстом */
  schedule: string | null;
  phone: string | null;
  receivesCargo: boolean;
  givesOutCargo: boolean;
  /** Ограничения на одно место: вес в килограммах, стороны в сантиметрах */
  maxWeightKg: number | null;
  maxLengthCm: number | null;
  maxWidthCm: number | null;
  maxHeightCm: number | null;
};

/** Доля от уже известных пунктов, меньше которой выгрузка считается битой */
const MIN_SHARE = 0.8;

/**
 * Можно ли погасить пункты, которых нет в новой выгрузке. Если перевозчик
 * вдруг отдал заметно меньше пунктов, чем было, это скорее сбой у него, чем
 * закрытие сети: гасить ничего не надо, иначе покупатели останутся без выбора.
 */
export function canDeactivateMissing(activeCount: number, incomingCount: number): boolean {
  return activeCount === 0 || incomingCount >= activeCount * MIN_SHARE;
}
