import "server-only";
import type { TerminalCarrier } from "@buscom/db/enums";
import { describeTerminalSync, syncTerminals } from "@/server/carriers/terminals";

const CARRIERS: TerminalCarrier[] = ["DELLIN", "PEC"];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Первое обновление — не сразу при старте: выкат и так нагружает сервер */
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

const globalForTerminals = globalThis as unknown as {
  terminalSyncTimers?: ReturnType<typeof setTimeout>[];
};

/**
 * Обновление справочника пунктов ТК раз в сутки. Запускается из
 * `src/instrumentation.ts`, только в бою: базу разработки делят две машины,
 * и там справочник обновляют кнопкой в «Администрирование → Транспортные компании».
 * Ключ читается на каждом проходе — заданный в интерфейсе начнёт работать без перезапуска.
 */
export function startTerminalSync(): void {
  if (process.env.NODE_ENV !== "production") return;
  for (const timer of globalForTerminals.terminalSyncTimers ?? []) clearTimeout(timer);

  // Перевозчики по очереди: сбой одного не мешает другому
  const tick = async () => {
    for (const carrier of CARRIERS) {
      try {
        const summary = await syncTerminals(carrier);
        if (summary) console.log(`[terminals] Справочник обновлён: ${describeTerminalSync(carrier, summary)}`);
      } catch (error) {
        console.error(`[terminals] Справочник ${carrier} не обновлён`, error);
      }
    }
  };

  const first = setTimeout(() => void tick(), FIRST_RUN_DELAY_MS);
  const daily = setInterval(() => void tick(), DAY_MS);
  globalForTerminals.terminalSyncTimers = [first, daily];
}
