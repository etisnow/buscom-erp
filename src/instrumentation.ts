/**
 * Выполняется один раз при старте сервера Next (node_modules/next/dist/docs,
 * «Instrumentation»). Здесь — фоновые задачи процесса: опрос ящика заказов, отправка уведомлений
 * и стирание файлов чата старше года.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMailPolling } = await import("@/server/integrations/mail-scheduler");
    startMailPolling();
    const { startNotificationDispatch } = await import("@/server/notifications/dispatch");
    startNotificationDispatch();
    const { startChatRetention } = await import("@/server/chat/retention");
    startChatRetention();
    // Импорт истории почты, оборванный выкатом, продолжается сам. Только в бою:
    // базу разработки делят две машины, и продолжили бы его обе
    if (process.env.NODE_ENV === "production") {
      const { resumeHistoryImport } = await import("@/server/emails/history-import");
      void resumeHistoryImport(true).catch((error: unknown) =>
        console.error("[mail] Импорт истории не продолжен", error),
      );
    }
  }
}
