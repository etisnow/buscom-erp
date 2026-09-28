import "server-only";
import { unstable_cache } from "next/cache";
import { z } from "zod";
import { postToErp } from "@/server/erp";

/**
 * Настройки сайта, которые задаются в ERP («Администрирование → Транспортные
 * компании»): ключ Яндекс Карт. Сайт спрашивает их у ERP подписанным запросом —
 * таблицу настроек он не читает, там пароли почты. Кеш — 10 минут.
 */

const configSchema = z.object({ yandexMapsApiKey: z.string().nullable() });

const CONFIG_TTL = 600;

const loadCached = unstable_cache(
  async (): Promise<z.infer<typeof configSchema>> => {
    const response = await postToErp("/api/integrations/site/config", {});
    if (!response?.ok) throw new Error(`ERP ответила ${response?.status ?? "— связь не настроена"}`);
    return configSchema.parse(await response.json());
  },
  ["site-config"],
  { revalidate: CONFIG_TTL, tags: ["site-config"] },
);

/** Ключ карт; `null` — не задан или ERP недоступна: тогда терминал выбирается без карты. */
export async function getMapsApiKey(): Promise<string | null> {
  try {
    return (await loadCached()).yandexMapsApiKey;
  } catch (error) {
    console.error("[site-config] Настройки из ERP недоступны", error);
    return null;
  }
}
