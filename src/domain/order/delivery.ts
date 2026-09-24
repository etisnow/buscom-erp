/**
 * Подписи способов доставки. Вынесены из компонента карточки: тот же текст
 * нужен и в заказе поставщику (`supplier-request.ts`), а расходиться подписям
 * нельзя — менеджер и поставщик должны видеть одно и то же.
 */
import type { DeliveryMethod } from "@/generated/prisma/enums";

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  PICKUP: "Самовывоз",
  CARRIER: "Транспортная компания",
  COURIER: "Своя доставка",
};

export function deliveryMethodLabel(method: DeliveryMethod | null): string | null {
  return method ? DELIVERY_METHOD_LABELS[method] : null;
}

/**
 * Груз (PRD, M5): вес и габариты для расчёта у ТК. Хранятся целыми — вес в
 * граммах, стороны в сантиметрах, — как деньги в копейках: без float в базе.
 * Показываются и вводятся в килограммах с запятой.
 */
export type Cargo = {
  weightGrams: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
};

/** Потолки против опечаток: 50 т и 50 м — заведомо больше любого груза компании. */
export const MAX_CARGO_WEIGHT_GRAMS = 50_000_000;
export const MAX_CARGO_SIDE_CM = 5_000;

export class CargoInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CargoInputError";
  }
}

/** «12,5» или «12.5» кг → 12 500 г; пусто — null. До граммов, больше трёх знаков — ошибка. */
export function parseWeightKg(input: string): number | null {
  const value = input.trim().replace(/\s/g, "").replace(",", ".");
  if (value === "") return null;
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) throw new CargoInputError("Вес — число в килограммах, до граммов: например, 12,5");
  const grams = Number(match[1]) * 1000 + Number((match[2] ?? "").padEnd(3, "0"));
  if (grams <= 0) throw new CargoInputError("Вес должен быть больше нуля");
  if (grams > MAX_CARGO_WEIGHT_GRAMS) throw new CargoInputError("Вес больше 50 т — проверьте, нет ли опечатки");
  return grams;
}

/** 12 500 г → «12,5». Для поля ввода и для текста. */
export function formatWeightKg(grams: number): string {
  return (grams / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 3, useGrouping: false });
}

/** Сторона в сантиметрах, целое; пусто — null. */
export function parseSideCm(input: string, label: string): number | null {
  const value = input.trim();
  if (value === "") return null;
  if (!/^\d+$/.test(value)) throw new CargoInputError(`${label} — целое число сантиметров`);
  const cm = Number(value);
  if (cm <= 0) throw new CargoInputError(`${label} должна быть больше нуля`);
  if (cm > MAX_CARGO_SIDE_CM) throw new CargoInputError(`${label} больше 50 м — проверьте, нет ли опечатки`);
  return cm;
}

/** «12,5 кг · 120 × 60 × 40 см»; незаполненные стороны — «?»; ничего не задано — null. */
export function formatCargo(cargo: Cargo): string | null {
  const sides = [cargo.lengthCm, cargo.widthCm, cargo.heightCm];
  const parts: string[] = [];
  if (cargo.weightGrams !== null) parts.push(`${formatWeightKg(cargo.weightGrams)} кг`);
  if (sides.some((side) => side !== null)) parts.push(`${sides.map((side) => side ?? "?").join(" × ")} см`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
