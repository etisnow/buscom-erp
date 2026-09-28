import "server-only";
import { parseDellinTerminals } from "@buscom/domain/carrier/dellin";
import { parsePecBranches } from "@buscom/domain/carrier/pec";
import { canDeactivateMissing, type CarrierTerminalRecord } from "@buscom/domain/carrier/terminals";
import type { CarrierSettings } from "@buscom/domain/settings";
import type { TerminalCarrier } from "@buscom/db/enums";
import { db } from "@/server/db";
import { downloadDellinTerminals } from "@/server/carriers/dellin";
import { downloadPecBranches } from "@/server/carriers/pec";
import { readSettings } from "@/server/settings/service";

/**
 * Справочник пунктов ТК (docs/SITE-PLAN.md, этап 5а). Обновляется из API
 * перевозчика раз в сутки (`scheduler.ts`) или кнопкой в «Администрирование →
 * Транспортные компании». Сайт читает таблицу напрямую и от API ТК не зависит.
 */

export type TerminalSyncSummary = {
  /** Пунктов в выгрузке */
  total: number;
  /** Пунктов, которые не разобрались (битые записи у перевозчика) */
  skipped: number;
  /** Погашено пропавших из выгрузки */
  deactivated: number;
  /** Выгрузка заметно меньше прежнего — пропавшие не гасились */
  suspicious: boolean;
};

type Loaded = { terminals: CarrierTerminalRecord[]; skipped: number };

/** Откуда берутся пункты каждого перевозчика; `null` — ключ не задан */
const SOURCES: Record<TerminalCarrier, (settings: CarrierSettings) => Promise<Loaded> | null> = {
  DELLIN: ({ dellinAppKey }) =>
    dellinAppKey ? downloadDellinTerminals(dellinAppKey).then(parseDellinTerminals) : null,
  PEC: ({ pecLogin, pecApiKey }) =>
    pecLogin && pecApiKey ? downloadPecBranches({ login: pecLogin, apiKey: pecApiKey }).then(parsePecBranches) : null,
};

export const CARRIER_LABELS: Record<TerminalCarrier, string> = { DELLIN: "ДЛ", PEC: "ПЭК" };

/** `null` — ключ перевозчика не задан, обновлять нечем. */
export async function syncTerminals(carrier: TerminalCarrier): Promise<TerminalSyncSummary | null> {
  const loading = SOURCES[carrier]((await readSettings()).carriers);
  if (!loading) return null;

  const { terminals, skipped } = await loading;
  const syncedAt = new Date();
  const activeBefore = await db.carrierTerminal.count({ where: { carrier, isActive: true } });

  // Без общей транзакции: сбой посередине оставит часть пунктов с прежними данными,
  // и следующее обновление их поправит. Длинная транзакция через туннель хуже
  for (const { externalId, ...data } of terminals) {
    await db.carrierTerminal.upsert({
      where: { carrier_externalId: { carrier, externalId } },
      create: { carrier, externalId, ...data, syncedAt },
      update: { ...data, isActive: true, syncedAt },
    });
  }

  const suspicious = !canDeactivateMissing(activeBefore, terminals.length);
  const deactivated = suspicious
    ? 0
    : (
        await db.carrierTerminal.updateMany({
          where: { carrier, isActive: true, syncedAt: { lt: syncedAt } },
          data: { isActive: false },
        })
      ).count;

  return { total: terminals.length, skipped, deactivated, suspicious };
}

export function describeTerminalSync(carrier: TerminalCarrier, summary: TerminalSyncSummary): string {
  const parts = [`пунктов ${CARRIER_LABELS[carrier]}: ${summary.total}`];
  if (summary.skipped) parts.push(`не разобрано: ${summary.skipped}`);
  if (summary.deactivated) parts.push(`закрыто: ${summary.deactivated}`);
  if (summary.suspicious) parts.push("выгрузка меньше прежней — пропавшие пункты оставлены");
  return parts.join(", ");
}

/** `givingOut` — сколько пунктов видит покупатель: выдают груз и не мелкие ПВЗ */
export type TerminalStats = { active: number; givingOut: number; syncedAt: Date | null };

export async function getTerminalStats(carrier: TerminalCarrier): Promise<TerminalStats> {
  const [active, givingOut, last] = await Promise.all([
    db.carrierTerminal.count({ where: { carrier, isActive: true } }),
    db.carrierTerminal.count({ where: { carrier, isActive: true, givesOutCargo: true, isPickupPoint: false } }),
    db.carrierTerminal.aggregate({ where: { carrier }, _max: { syncedAt: true } }),
  ]);
  return { active, givingOut, syncedAt: last._max.syncedAt };
}
