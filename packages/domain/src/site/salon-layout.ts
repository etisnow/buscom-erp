/**
 * Схема салона (справочник «Схемы салонов»): сколько в ней мест и сколько сидений
 * идёт с подлокотником и с откидной спинкой. Из этих чисел потом считается цена
 * комплекта пассажирского сиденья — цена опции умножается на количество.
 */
import { z } from "zod";

const MAX_SEATS = 60;

const count = (label: string, max: number) =>
  z
    .number({ error: `${label}: нужно число` })
    .int({ error: `${label}: нужно целое число` })
    .min(0, { error: `${label} не может быть отрицательным` })
    .max(max, { error: `${label}: не больше ${max}` });

export const salonLayoutSchema = z
  .object({
    name: z.string().trim().min(1, { error: "Название не может быть пустым" }).max(120),
    seats: count("Число мест", MAX_SEATS).min(1, { error: "В схеме должно быть хотя бы одно место" }),
    armrests: count("Подлокотники", MAX_SEATS),
    reclinerBacks: count("Откидные спинки", MAX_SEATS),
  })
  .refine((layout) => layout.armrests <= layout.seats, {
    error: "Подлокотников не может быть больше, чем мест",
    path: ["armrests"],
  })
  .refine((layout) => layout.reclinerBacks <= layout.seats, {
    error: "Откидных спинок не может быть больше, чем мест",
    path: ["reclinerBacks"],
  });

export type SalonLayoutInput = z.infer<typeof salonLayoutSchema>;
