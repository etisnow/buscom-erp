"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";
import {
  clearDewatermarkKeyAction,
  clearPhotoroomKeyAction,
  saveDewatermarkKeyAction,
  savePhotoroomKeyAction,
} from "@/app/(app)/admin/services/actions";

/**
 * Ключ API внешнего сервиса. Сохранённый ключ в браузер не отдаётся: поле приходит
 * пустым, а `hasKey` говорит, задан ли он. Пустое поле при сохранении — «оставить прежний».
 */
function ServiceKeyEditor({
  id,
  title,
  description,
  hasKey,
  envStatus,
  emptyStatus,
  onSave,
  onClear,
}: {
  id: string;
  title: string;
  description: ReactNode;
  hasKey: boolean;
  /** Что сказать, если ключа здесь нет, но он есть в окружении сервера; null — окружения нет */
  envStatus: string | null;
  emptyStatus: string;
  onSave: (value: string) => Promise<SettingsResult>;
  onClear: () => Promise<SettingsResult>;
}) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function handle(action: () => Promise<SettingsResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        setValue("");
      } else toast.error(result.error);
    });
  }

  const status = hasKey ? "Пустое поле оставит сохранённый ключ" : (envStatus ?? emptyStatus);

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      <div className="flex max-w-md flex-col gap-1.5">
        <Label className="text-xs" htmlFor={id}>
          Ключ API
        </Label>
        <Input
          id={id}
          type="password"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-8"
          placeholder={hasKey ? "сохранён, оставьте пустым" : ""}
        />
        <span className="text-muted-foreground text-xs">{status}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !value.trim()}
          onClick={() => handle(() => onSave(value))}
        >
          Сохранить ключ
        </Button>
        {hasKey ? (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={pending}
            onClick={() => handle(onClear)}
          >
            Удалить ключ
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export function DewatermarkKeyEditor({ hasKey, hasEnvKey }: { hasKey: boolean; hasEnvKey: boolean }) {
  return (
    <ServiceKeyEditor
      id="dewatermark-key"
      title="Снятие водяного знака"
      description={
        <>
          Ключ API из кабинета{" "}
          <a href="https://dewatermark.ai/" target="_blank" rel="noreferrer" className="underline">
            dewatermark.ai
          </a>
          . По нему «Импорт с сайта поставщика» в «Товарах» снимает знак поставщика со снимков; в форме импорта у
          каждого снимка можно вернуть оригинал. Сервис платный: каждый снимок — один кредит.
        </>
      }
      hasKey={hasKey}
      envStatus={hasEnvKey ? "Здесь ключ не задан — работает ключ из переменной DEWATERMARK_API_KEY на сервере" : null}
      emptyStatus="Ключ не задан — снимки импортируются со знаком"
      onSave={saveDewatermarkKeyAction}
      onClear={clearDewatermarkKeyAction}
    />
  );
}

export function PhotoroomKeyEditor({ hasKey }: { hasKey: boolean }) {
  return (
    <ServiceKeyEditor
      id="photoroom-key"
      title="Удаление фона"
      description={
        <>
          Ключ API из кабинета{" "}
          <a href="https://www.photoroom.com/api" target="_blank" rel="noreferrer" className="underline">
            photoroom.com
          </a>
          . По нему «Импорт с сайта поставщика» в «Товарах» делает фон снимков прозрачным; в форме импорта у каждого
          снимка можно вернуть оригинал. Сервис платный: каждый снимок — один запрос по тарифу.
        </>
      }
      hasKey={hasKey}
      envStatus={null}
      emptyStatus="Ключ не задан — фон со снимков не удаляется"
      onSave={savePhotoroomKeyAction}
      onClear={clearPhotoroomKeyAction}
    />
  );
}
