"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";
import {
  checkDellinKeyAction,
  checkKitAction,
  checkPecAction,
  clearDellinKeyAction,
  clearKitAction,
  clearPecAction,
  saveCarrierSettingsAction,
  saveKitAction,
  saveMapsKeyAction,
  savePecAction,
  syncTerminalsAction,
} from "@/app/(app)/admin/carriers/actions";
import type { TerminalCarrier } from "@buscom/db/enums";

/** Справочник в базе: действующие пункты, из них видимые покупателю, время последнего обновления по Москве */
export type TerminalsView = { active: number; givingOut: number; syncedAt: string | null };

/**
 * Ключ API «Деловых Линий». Сохранённый ключ в браузер не отдаётся: поле приходит
 * пустым, а `hasDellinKey` говорит, задан ли он. Пустое поле при сохранении — «оставить прежний».
 */
export function CarrierKeysEditor({ hasDellinKey, terminals }: { hasDellinKey: boolean; terminals: TerminalsView }) {
  const [dellinAppKey, setDellinAppKey] = useState("");
  const [pending, startTransition] = useTransition();

  function handle(action: () => Promise<SettingsResult>, clearField = false) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        if (clearField) setDellinAppKey("");
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Деловые Линии</h2>
        <p className="text-muted-foreground text-sm">
          Ключ приложения из кабинета разработчика{" "}
          <a href="https://dev.dellin.ru/" target="_blank" rel="noreferrer" className="underline">
            dev.dellin.ru
          </a>{" "}
          — регистрация бесплатная, договор не нужен. По ключу ERP берёт у ДЛ справочник терминалов, из которого
          покупатель выбирает пункт получения при оформлении заказа.
        </p>
      </div>

      <div className="flex max-w-md flex-col gap-1.5">
        <Label className="text-xs" htmlFor="dellin-appkey">
          Ключ приложения (appkey)
        </Label>
        <Input
          id="dellin-appkey"
          type="password"
          autoComplete="off"
          value={dellinAppKey}
          onChange={(event) => setDellinAppKey(event.target.value)}
          className="h-8"
          placeholder={hasDellinKey ? "сохранён, оставьте пустым" : ""}
        />
        <span className="text-muted-foreground text-xs">
          {hasDellinKey ? "Пустое поле оставит сохранённый ключ" : "Ключ не задан — терминалы ДЛ не загружаются"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || (!dellinAppKey && !hasDellinKey)}
          onClick={() => handle(() => saveCarrierSettingsAction({ dellinAppKey }), true)}
        >
          Сохранить ключ
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || (!dellinAppKey && !hasDellinKey)}
          onClick={() => handle(() => checkDellinKeyAction({ dellinAppKey }))}
        >
          Проверить ключ
        </Button>
        {hasDellinKey ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => handle(clearDellinKeyAction, true)}
          >
            Удалить ключ
          </Button>
        ) : null}
        <span className="text-muted-foreground text-xs">Проверяется ключ из поля, а если оно пустое — сохранённый</span>
      </div>

      <TerminalSync carrier="DELLIN" terminals={terminals} enabled={hasDellinKey} />
    </section>
  );
}

/**
 * Ключ Яндекс Карт для карты терминалов в оформлении на сайте. Не секрет — карта
 * грузится в браузере покупателя с этим ключом, — поэтому в форме виден как есть.
 */
export function MapsKeyEditor({ yandexMapsApiKey }: { yandexMapsApiKey: string }) {
  const [value, setValue] = useState(yandexMapsApiKey);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveMapsKeyAction(value);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Карта терминалов на сайте</h2>
        <p className="text-muted-foreground text-sm">
          Ключ продукта «JavaScript API» (геокодер не нужен — координаты пунктов дают сами ТК) из кабинета{" "}
          <a href="https://developer.tech.yandex.ru/" target="_blank" rel="noreferrer" className="underline">
            developer.tech.yandex.ru
          </a>
          . В кабинете ограничьте ключ адресами сайта (bus-com.ru, new.bus-com.ru): ключ виден в браузере покупателя, и
          без ограничения его может взять кто угодно. Пустое поле — терминалы выбираются без карты.
        </p>
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <Label className="text-xs" htmlFor="yandex-maps-key">
          Ключ Яндекс Карт
        </Label>
        <Input
          id="yandex-maps-key"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8"
        />
      </div>
      <div>
        <Button size="sm" variant="outline" disabled={pending || value === yandexMapsApiKey} onClick={save}>
          Сохранить ключ карт
        </Button>
      </div>
    </section>
  );
}

/** Строка справочника перевозчика: сколько пунктов, когда обновлён, «Обновить сейчас». */
function TerminalSync({
  carrier,
  terminals,
  enabled,
}: {
  carrier: TerminalCarrier;
  terminals: TerminalsView;
  /** Ключ перевозчика сохранён — обновлять есть чем */
  enabled: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function sync() {
    startTransition(async () => {
      const result = await syncTerminalsAction(carrier);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3">
      <span className="text-sm">
        {terminals.syncedAt
          ? `Пунктов в справочнике: ${terminals.active}, из них покупателю показываются: ${terminals.givingOut}. Обновлено ${terminals.syncedAt}`
          : "Справочник пунктов ещё не загружался"}
      </span>
      <Button size="sm" variant="outline" disabled={pending || !enabled} onClick={sync}>
        {pending ? "Обновляем…" : "Обновить сейчас"}
      </Button>
      <span className="text-muted-foreground text-xs">
        В бою справочник обновляется сам раз в сутки; обновление занимает до минуты
      </span>
    </div>
  );
}

/**
 * Доступ к API ПЭК: логин личного кабинета и ключ API. Ключ, как у ДЛ, в браузер
 * не отдаётся — пустое поле при сохранении оставляет прежний.
 */
export function PecKeysEditor({
  pecLogin,
  hasPecKey,
  terminals,
}: {
  pecLogin: string;
  hasPecKey: boolean;
  terminals: TerminalsView;
}) {
  const [login, setLogin] = useState(pecLogin);
  const [apiKey, setApiKey] = useState("");
  const [pending, startTransition] = useTransition();
  const configured = Boolean(pecLogin) && hasPecKey;

  function handle(action: () => Promise<SettingsResult>, clearKey = false) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        if (clearKey) setApiKey("");
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">ПЭК</h2>
        <p className="text-muted-foreground text-sm">
          Логин{" "}
          <a href="https://kabinet.pecom.ru/" target="_blank" rel="noreferrer" className="underline">
            личного кабинета ПЭК
          </a>{" "}
          и ключ из раздела «Регистрационные данные → Ключи API» — договор не нужен. По ним ERP берёт список отделений
          ПЭК; мелкие ПВЗ покупателю не показываются — сиденья туда не примут.
        </p>
      </div>

      <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="pec-login">
            Логин кабинета
          </Label>
          <Input
            id="pec-login"
            autoComplete="off"
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            className="h-8"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="pec-key">
            Ключ API
          </Label>
          <Input
            id="pec-key"
            type="password"
            autoComplete="new-password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className="h-8"
            placeholder={hasPecKey ? "сохранён, оставьте пустым" : ""}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !login || (!apiKey && !hasPecKey)}
          onClick={() => handle(() => savePecAction({ pecLogin: login, pecApiKey: apiKey }), true)}
        >
          Сохранить
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || !login || (!apiKey && !hasPecKey)}
          onClick={() => handle(() => checkPecAction({ pecLogin: login, pecApiKey: apiKey }))}
        >
          {pending ? "Проверяем…" : "Проверить"}
        </Button>
        {configured ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => handle(clearPecAction, true)}
          >
            Удалить доступ
          </Button>
        ) : null}
        <span className="text-muted-foreground text-xs">
          Проверяется то, что в полях, — сохранять перед этим не нужно
        </span>
      </div>

      <TerminalSync carrier="PEC" terminals={terminals} enabled={configured} />
    </section>
  );
}

/**
 * Токен API «КИТ» (ГТД): нужен только для кнопки «Проверить статус груза» в заказе.
 * Сохранённый токен в браузер не отдаётся — пустое поле оставляет прежний.
 */
export function KitKeyEditor({ hasKitToken, terminals }: { hasKitToken: boolean; terminals: TerminalsView }) {
  const [token, setToken] = useState("");
  const [pending, startTransition] = useTransition();

  function handle(action: () => Promise<SettingsResult>, clearField = false) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        if (clearField) setToken("");
      } else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">КИТ (ГТД)</h2>
        <p className="text-muted-foreground text-sm">
          Токен API из личного кабинета КИТ. По нему ERP берёт список терминалов КИТ — из него покупатель выбирает пункт
          получения в корзине — и узнаёт статус груза по номеру накладной (кнопка «Проверить статус груза» в блоке
          «Доставка» заказа). Графика работы терминалов КИТ не отдаёт — в корзине он не показывается.
        </p>
      </div>

      <div className="flex max-w-md flex-col gap-1.5">
        <Label className="text-xs" htmlFor="kit-token">
          Токен API
        </Label>
        <Input
          id="kit-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          className="h-8"
          placeholder={hasKitToken ? "сохранён, оставьте пустым" : ""}
        />
        <span className="text-muted-foreground text-xs">
          {hasKitToken ? "Пустое поле оставит сохранённый токен" : "Токен не задан — статус груза КИТ не проверяется"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || (!token && !hasKitToken)}
          onClick={() => handle(() => saveKitAction({ kitToken: token }), true)}
        >
          Сохранить токен
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending || (!token && !hasKitToken)}
          onClick={() => handle(() => checkKitAction({ kitToken: token }))}
        >
          {pending ? "Проверяем…" : "Проверить токен"}
        </Button>
        {hasKitToken ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => handle(clearKitAction, true)}
          >
            Удалить токен
          </Button>
        ) : null}
        <span className="text-muted-foreground text-xs">
          Проверяется токен из поля, а если оно пустое — сохранённый
        </span>
      </div>

      <TerminalSync carrier="KIT" terminals={terminals} enabled={hasKitToken} />
    </section>
  );
}
