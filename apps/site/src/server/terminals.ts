import "server-only";
import { unstable_cache } from "next/cache";
import { terminalCarrierOf, type TerminalSnapshot } from "@buscom/domain/carrier/terminals";
import type { TerminalCarrier } from "@buscom/db/enums";
import { db } from "@/server/db";

/**
 * Терминалы ТК для выбора при оформлении (docs/SITE-PLAN.md, этап 5а). Справочник
 * ведёт ERP (обновляет раз в сутки из API перевозчика), сайт его только читает —
 * от API ТК в момент заказа не зависит.
 */

/** Пункт в списке выбора: только то, что видит покупатель */
export type TerminalOption = { id: string; city: string; name: string; address: string; schedule: string | null };

/** Справочник меняется раз в сутки — часа кеша достаточно */
const TERMINALS_TTL = 3600;

const listCached = unstable_cache(
  async (carrier: TerminalCarrier): Promise<TerminalOption[]> => {
    const terminals = await db.carrierTerminal.findMany({
      where: { carrier, isActive: true, givesOutCargo: true },
      orderBy: [{ cityName: "asc" }, { name: "asc" }],
      select: { externalId: true, cityName: true, name: true, address: true, schedule: true },
    });
    return terminals.map((terminal) => ({
      id: terminal.externalId,
      city: terminal.cityName,
      name: terminal.name,
      address: terminal.address,
      schedule: terminal.schedule,
    }));
  },
  ["carrier-terminals"],
  { revalidate: TERMINALS_TTL, tags: ["terminals"] },
);

/**
 * Пункты выдачи перевозчика по его названию из формы. Пустой список — у ТК нет
 * справочника или база недоступна: тогда покупатель вписывает адрес руками.
 */
export async function listTerminals(carrierName: string): Promise<TerminalOption[]> {
  const carrier = terminalCarrierOf(carrierName);
  if (!carrier) return [];
  try {
    return await listCached(carrier);
  } catch (error) {
    // Например, роли базы сайта не выдали права на таблицу (scripts/site-db-role.sql)
    console.error("[terminals] Справочник терминалов недоступен", error);
    return [];
  }
}

/**
 * Терминал для заказа — из базы, мимо кеша: закрытый со вчерашнего дня пункт
 * в заказ не попадёт. `null` — такого действующего пункта выдачи нет.
 */
export async function findTerminal(carrierName: string, id: string): Promise<TerminalSnapshot | null> {
  const carrier = terminalCarrierOf(carrierName);
  if (!carrier) return null;
  const terminal = await db.carrierTerminal.findUnique({
    where: { carrier_externalId: { carrier, externalId: id } },
    select: { name: true, cityName: true, address: true, schedule: true, isActive: true, givesOutCargo: true },
  });
  if (!terminal?.isActive || !terminal.givesOutCargo) return null;
  return {
    carrier,
    code: id,
    name: terminal.name,
    city: terminal.cityName,
    address: terminal.address,
    schedule: terminal.schedule,
  };
}
