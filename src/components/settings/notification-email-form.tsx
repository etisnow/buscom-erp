"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  saveNotificationEmailAction,
  sendTestNotificationAction,
  type UserSettingsResult,
} from "@/app/(app)/settings/actions";

export function NotificationEmailForm({
  loginEmail,
  notificationEmail,
}: {
  loginEmail: string;
  notificationEmail: string | null;
}) {
  const [value, setValue] = useState(notificationEmail ?? "");
  const [pending, startTransition] = useTransition();

  function run(action: (value: string) => Promise<UserSettingsResult>) {
    startTransition(async () => {
      const result = await action(value);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Почта для уведомлений</h2>
        <p className="text-muted-foreground text-sm">
          Сюда будут приходить уведомления системы. Если оставить пустым — на адрес входа {loginEmail}.
        </p>
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(saveNotificationEmailAction);
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="notification-email">
            Адрес
          </Label>
          <Input
            id="notification-email"
            type="email"
            autoComplete="email"
            placeholder={loginEmail}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 w-72"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          Сохранить
        </Button>
        {/* Проверяет то, что в поле, — в том числе ещё не сохранённое */}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(sendTestNotificationAction)}
        >
          Отправить тестовое письмо
        </Button>
      </form>
    </section>
  );
}
