import "server-only";
import { purgeExpiredChatAttachments } from "@/server/chat/service";

/** Проверка раз в 6 часов: срок в год, точность до часов не нужна. */
const INTERVAL_MS = 6 * 60 * 60 * 1000;

async function runPurge(): Promise<void> {
  try {
    const count = await purgeExpiredChatAttachments();
    if (count) console.log(`[chat] Стёрто файлов старше года: ${count}`);
  } catch (error) {
    console.error(`[chat] Файлы старше года не стёрты: ${error instanceof Error ? error.message : error}`);
  }
}

const globalForChat = globalThis as unknown as { chatRetentionTimer?: ReturnType<typeof setInterval> };

/**
 * Таймер из `src/instrumentation.ts`. На общей dev-базе его запускают обе машины —
 * безвредно: повторный проход ничего не находит.
 */
export function startChatRetention(): void {
  if (globalForChat.chatRetentionTimer) clearInterval(globalForChat.chatRetentionTimer);
  globalForChat.chatRetentionTimer = setInterval(() => void runPurge(), INTERVAL_MS);
  void runPurge();
}
