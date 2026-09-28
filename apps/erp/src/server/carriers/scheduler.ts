import "server-only";
import { describeTerminalSync, syncDellinTerminals } from "@/server/carriers/terminals";

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

  const tick = async () => {
    try {
      const summary = await syncDellinTerminals();
      if (summary) console.log(`[terminals] Справочник обновлён: ${describeTerminalSync(summary)}`);
    } catch (error) {
      console.error("[terminals] Справочник ДЛ не обновлён", error);
    }
  };

  const first = setTimeout(() => void tick(), FIRST_RUN_DELAY_MS);
  const daily = setInterval(() => void tick(), DAY_MS);
  globalForTerminals.terminalSyncTimers = [first, daily];
}
