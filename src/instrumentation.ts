/**
 * Выполняется один раз при старте сервера Next (node_modules/next/dist/docs,
 * «Instrumentation»). Здесь — фоновые задачи процесса: опрос ящика заказов.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMailPolling } = await import("@/server/integrations/mail-scheduler");
    startMailPolling();
  }
}
