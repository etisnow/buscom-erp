"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";
import {
  checkDellinKeyAction,
  clearDellinKeyAction,
  saveCarrierSettingsAction,
  saveMapsKeyAction,
  syncDellinTerminalsAction,
} from "@/app/(app)/admin/carriers/actions";

/**
 * Ключ API «Деловых Линий». Сохранённый ключ в браузер не отдаётся: поле приходит
 * пустым, а `hasDellinKey` говорит, задан ли он. Пустое поле при сохранении — «оставить прежний».
 */
export function CarrierKeysEditor({
  hasDellinKey,
  terminals,
}: {
  hasDellinKey: boolean;
  /** Справочник в базе: действующие пункты, из них выдающие груз, время последнего обновления по Москве */
  terminals: { active: number; givingOut: number; syncedAt: string | null };
}) {
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

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <span className="text-sm">
          {terminals.syncedAt
            ? `Терминалов в справочнике: ${terminals.active}, выдают груз: ${terminals.givingOut}. Обновлено ${terminals.syncedAt}`
            : "Справочник терминалов ещё не загружался"}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !hasDellinKey}
          onClick={() => handle(syncDellinTerminalsAction)}
        >
          Обновить сейчас
        </Button>
        <span className="text-muted-foreground text-xs">
          В бою справочник обновляется сам раз в сутки; обновление занимает до минуты
        </span>
      </div>
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
          Ключ «JavaScript API и HTTP Геокодер» из кабинета{" "}
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
