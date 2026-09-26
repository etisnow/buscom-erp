/**
 * Цепочка этапов поставщика и трек поставщика в заказе (docs/DECISIONS.md, «Поставщики»).
 *
 * Глобальный статус заказа остаётся главным. Этапы поставщика — его подстатусы,
 * пока заказ в работе: у каждого поставщика своя цепочка, и в заказе с товарами
 * нескольких поставщиков трек у каждого свой. В «Выполнен» заказ не уходит,
 * пока все треки не дошли до последнего этапа.
 */
import type { OrderStatus, UserRole } from "@buscom/db/enums";

/** Больше этапов в цепочке — уже не цепочка, а список дел; ограничиваем, чтобы карточка не расползалась. */
export const SUPPLIER_STAGES_MAX = 20;

/**
 * Этапы поставщиков — подстатусы «В работе»: двигаются только в этом статусе.
 * Промежуточных глобальных статусов (оплата, отправка) больше нет — всё это этапы.
 */
export const SUPPLIER_WORK_STATUSES: readonly OrderStatus[] = ["IN_PROGRESS"];

const STAGE_ROLES: readonly UserRole[] = ["MANAGER", "HEAD", "ADMIN"];

export class SupplierStageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierStageError";
  }
}

/**
 * Проверка цепочки перед сохранением: пустые названия и повторы отклоняем, а не
 * чистим молча — человек должен видеть, что именно ушло в базу.
 */
export function normalizeStageNames(names: string[]): string[] {
  const result = names.map((name) => name.trim());

  if (result.some((name) => name === "")) {
    throw new SupplierStageError("У каждого этапа должно быть название");
  }
  if (result.length > SUPPLIER_STAGES_MAX) {
    throw new SupplierStageError(`В цепочке не больше ${SUPPLIER_STAGES_MAX} этапов`);
  }

  const seen = new Set<string>();
  for (const name of result) {
    const key = name.toLocaleLowerCase("ru");
    if (seen.has(key)) throw new SupplierStageError(`Этап «${name}» повторяется`);
    seen.add(key);
  }

  return result;
}

/** Положение трека: `stageIndex` null — работа с поставщиком ещё не начата. */
export type TrackPosition = {
  supplierName: string;
  stageIndex: number | null;
  stagesCount: number;
};

/** Трек пройден, когда стоит на последнем этапе. Поставщик без цепочки заказ не держит. */
export function isTrackComplete(track: TrackPosition): boolean {
  if (track.stagesCount === 0) return true;
  return track.stageIndex === track.stagesCount - 1;
}

export function incompleteTracks(tracks: readonly TrackPosition[]): TrackPosition[] {
  return tracks.filter((track) => !isTrackComplete(track));
}

export function canMoveStages(status: OrderStatus, role: UserRole): boolean {
  return SUPPLIER_WORK_STATUSES.includes(status) && STAGE_ROLES.includes(role);
}

type StageMoveInput = {
  orderStatus: OrderStatus;
  role: UserRole;
  /** Текущий этап, null — не начат */
  fromIndex: number | null;
  /** Новый этап, null — вернуть в «не начат» */
  toIndex: number | null;
  stagesCount: number;
};

/**
 * Этапы проходят по порядку: шаг вперёд или шаг назад, чтобы поправить ошибку.
 * Перепрыгивать нельзя — иначе цепочка перестала бы значить последовательность.
 */
export function assertStageMove({ orderStatus, role, fromIndex, toIndex, stagesCount }: StageMoveInput): void {
  if (!SUPPLIER_WORK_STATUSES.includes(orderStatus)) {
    throw new SupplierStageError("Этапы поставщика меняются, только пока заказ в работе");
  }
  if (!STAGE_ROLES.includes(role)) {
    throw new SupplierStageError("Недостаточно прав, чтобы менять этап поставщика");
  }
  if (toIndex !== null && (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= stagesCount)) {
    throw new SupplierStageError("Такого этапа в цепочке поставщика нет");
  }

  // «Не начат» считаем позицией −1: так шаг из него на первый этап — обычный шаг вперёд.
  const from = fromIndex ?? -1;
  const to = toIndex ?? -1;
  if (Math.abs(to - from) !== 1) {
    throw new SupplierStageError("Этапы проходят по порядку: на шаг вперёд или на шаг назад");
  }
}
