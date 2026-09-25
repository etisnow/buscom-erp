"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  sendTestPushAction,
  subscribePushAction,
  unsubscribePushAction,
  type UserSettingsResult,
} from "@/app/(app)/settings/actions";

type DeviceState = "loading" | "insecure" | "ios-browser" | "unsupported" | "denied" | "off" | "on";

/** Открытый ключ VAPID приходит строкой base64url, браузеру нужен массив байтов. */
function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  // iPad с iPadOS 13+ представляется Маком — отличаем по сенсорному экрану
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/**
 * Пуш-уведомления на этом устройстве. Подписка — у браузера конкретного телефона
 * или компьютера, поэтому включать нужно на каждом устройстве отдельно.
 */
export function PushSettings({ publicKey, deviceCount }: { publicKey: string; deviceCount: number }) {
  const [state, setState] = useState<DeviceState>("loading");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      if (!window.isSecureContext) return setState("insecure");
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setState(isIos() && !isStandalone() ? "ios-browser" : "unsupported");
      if (Notification.permission === "denied") return setState("denied");
      try {
        const subscription = await (await registration()).pushManager.getSubscription();
        // Подписка есть в браузере — напоминаем о ней серверу: её могли удалить там
        // (сервис пушей отказал) или завести под другим сотрудником на общем компьютере.
        if (subscription) await subscribePushAction(subscription.toJSON());
        setState(subscription ? "on" : "off");
      } catch {
        setState("unsupported");
      }
    })();
  }, []);

  function run(action: () => Promise<UserSettingsResult | null>) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result) return;
        if (result.ok) toast.success(result.message);
        else toast.error(result.error);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Не получилось");
      }
    });
  }

  const enable = () =>
    run(async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return { ok: false, error: "Браузер не разрешил уведомления" };
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const subscription =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
      const result = await subscribePushAction(subscription.toJSON());
      if (result.ok) setState("on");
      return result;
    });

  const disable = () =>
    run(async () => {
      const subscription = await (await registration()).pushManager.getSubscription();
      if (!subscription) {
        setState("off");
        return null;
      }
      const result = await unsubscribePushAction(subscription.endpoint);
      await subscription.unsubscribe();
      setState("off");
      return result;
    });

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Уведомления на телефоне</h2>
        <p className="text-muted-foreground text-sm">
          Пуш о новых сообщениях в чате — даже когда ERP закрыта. Включается на каждом устройстве отдельно.
          {deviceCount ? ` Включено на устройствах: ${deviceCount}.` : ""}
        </p>
      </div>

      {state === "loading" ? <p className="text-muted-foreground text-sm">Проверяем браузер…</p> : null}

      {state === "insecure" ? (
        <p className="text-sm">Уведомления работают только по https — откройте ERP по адресу https://erp.bus-com.ru.</p>
      ) : null}

      {state === "ios-browser" ? (
        <div className="text-sm">
          <p>На iPhone уведомления приходят только в ERP, добавленной на главный экран (iOS 16.4 и новее):</p>
          <ol className="mt-1 list-decimal pl-5">
            <li>откройте ERP в Safari;</li>
            <li>нажмите «Поделиться» (квадрат со стрелкой) → «На экран Домой» → «Добавить»;</li>
            <li>откройте ERP значком с главного экрана, войдите и вернитесь сюда, в «Настройки».</li>
          </ol>
        </div>
      ) : null}

      {state === "unsupported" ? (
        <p className="text-sm">Этот браузер не поддерживает пуш-уведомления. На Android — откройте ERP в Chrome.</p>
      ) : null}

      {state === "denied" ? (
        <p className="text-sm">
          Уведомления для сайта запрещены в браузере. Разрешите их в настройках сайта (значок замка слева от адреса →
          «Уведомления»), а на телефоне — ещё и в настройках системы для браузера или приложения, затем обновите
          страницу.
        </p>
      ) : null}

      {state === "off" || state === "on" ? (
        <div className="flex flex-wrap items-center gap-2">
          {state === "off" ? (
            <Button size="sm" disabled={pending} onClick={enable}>
              Включить на этом устройстве
            </Button>
          ) : (
            <>
              <span className="text-sm">Включено на этом устройстве.</span>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(sendTestPushAction)}>
                Проверить
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={disable}>
                Выключить
              </Button>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
