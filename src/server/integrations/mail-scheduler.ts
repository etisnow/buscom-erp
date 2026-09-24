import "server-only";
import { env } from "@/server/env";
import { describePoll, isMailboxConfigured, pollMailbox } from "@/server/integrations/mailbox";

const DEFAULT_PRODUCTION_SECONDS = 120;

/** Таймер один на процесс: в разработке модуль перезагружается, а interval пережил бы его. */
const globalForMail = globalThis as unknown as { siteMailTimer?: ReturnType<typeof setInterval> };

/**
 * Периодический опрос общего ящика. Запускается из `src/instrumentation.ts` при
 * старте сервера. Таймер работает, даже пока ящик не настроен: настройки живут в
 * «Администрирование → Настройки почты» и читаются на каждом проходе — ящик,
 * заданный там, начнёт проверяться без перезапуска. Ошибки только пишутся в лог:
 * сеть или почтовый сервер бывают недоступны, следующий проход попробует снова.
 */
export function startMailPolling(): void {
  const seconds = env.IMAP_POLL_SECONDS ?? (process.env.NODE_ENV === "production" ? DEFAULT_PRODUCTION_SECONDS : 0);
  if (seconds === 0) return;
  if (globalForMail.siteMailTimer) clearInterval(globalForMail.siteMailTimer);

  let lastError: string | null = null;
  let warnedUnconfigured = false;
  const tick = async () => {
    try {
      if (!(await isMailboxConfigured())) {
        // Одно предупреждение, а не каждые две минуты
        if (!warnedUnconfigured) {
          console.warn("[mail] Ящик не настроен (Администрирование → Настройки почты) — письма не принимаются");
        }
        warnedUnconfigured = true;
        return;
      }
      warnedUnconfigured = false;
      const summary = await pollMailbox();
      const quiet =
        !summary.baseline && !summary.created.length && !summary.failed && !summary.duplicates && !summary.letters;
      if (!quiet) console.log(`[mail] ${describePoll(summary)}`);
      if (lastError) console.log("[mail] Ящик снова доступен");
      lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Одна и та же ошибка каждые две минуты засоряет лог — пишем её при смене
      if (message !== lastError) console.error(`[mail] Не удалось проверить ящик: ${message}`);
      lastError = message;
    }
  };

  globalForMail.siteMailTimer = setInterval(tick, seconds * 1000);
  void tick();
  console.log(`[mail] Ящик проверяется раз в ${seconds} с`);
}
