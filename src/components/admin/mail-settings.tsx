"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ImapSettings, SmtpSettings } from "@/domain/settings";
import type { SettingsResult } from "@/app/(app)/admin/dictionaries/actions";
import {
  listImapFoldersAction,
  saveImapAction,
  saveSmtpAction,
  sendTestMailAction,
  testImapAction,
} from "@/app/(app)/admin/mail/actions";
import { buildFolderTree, flattenFolderTree, SPECIAL_FOLDER_LABELS, type MailFolderNode } from "@/domain/email/folders";

/** Действие настройки: ожидание и итог тостом. */
function useSettingsAction() {
  const [pending, startTransition] = useTransition();

  function handle(action: Promise<SettingsResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return { pending, handle };
}

/** Поля почтового сервера, кроме пароля и признака шифрования — у них своя разметка. */
const SMTP_FIELDS: { key: "host" | "user" | "from"; label: string; hint: string }[] = [
  { key: "host", label: "Сервер (SMTP-хост)", hint: "Например, smtp.yandex.ru. Пустой — почта выключена" },
  { key: "user", label: "Пользователь", hint: "Обычно полный адрес ящика" },
  { key: "from", label: "От кого", hint: "Должен совпадать с ящиком, иначе письмо отклонят" },
];

/**
 * Настройки почты. Сохранённый пароль в браузер не отдаётся: поле приходит
 * пустым, а `hasPassword` говорит, задан ли он. Пустое поле при сохранении
 * означает «оставить прежний».
 */
export function SmtpEditor({
  smtp,
  hasPassword,
  testRecipient,
}: {
  smtp: SmtpSettings;
  hasPassword: boolean;
  /** Куда уйдёт проверочное письмо — адрес текущего администратора */
  testRecipient: string;
}) {
  const [values, setValues] = useState<SmtpSettings>(smtp);
  const { pending, handle } = useSettingsAction();

  const set = (key: keyof SmtpSettings, value: string | number | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Исходящая почта (SMTP)</h2>
        <p className="text-muted-foreground text-sm">
          Через этот сервер уходят письма клиентам из карточки заказа, уведомления сотрудникам и ссылки на смену пароля.
          Для переписки с клиентами «От кого» должен быть адресом общего ящика ниже — иначе ответы клиентов уйдут мимо
          ERP. Пока сервер не указан, письма клиентам не отправляются, а служебные пишутся в лог.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SMTP_FIELDS.map((field) => (
          <div key={field.key} className="flex flex-col gap-1.5">
            <Label className="text-xs" htmlFor={`smtp-${field.key}`}>
              {field.label}
            </Label>
            <Input
              id={`smtp-${field.key}`}
              value={values[field.key]}
              onChange={(event) => set(field.key, event.target.value)}
              className="h-8"
            />
            <span className="text-muted-foreground text-xs">{field.hint}</span>
          </div>
        ))}

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="smtp-password">
            Пароль
          </Label>
          <Input
            id="smtp-password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => set("password", event.target.value)}
            className="h-8"
            placeholder={hasPassword ? "сохранён, оставьте пустым" : ""}
          />
          <span className="text-muted-foreground text-xs">
            {hasPassword
              ? "Пустое поле оставит сохранённый пароль"
              : "У Яндекса и mail.ru нужен пароль приложения, а не пароль от ящика"}
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="smtp-port">
            Порт
          </Label>
          <Input
            id="smtp-port"
            inputMode="numeric"
            value={String(values.port)}
            onChange={(event) => set("port", event.target.value)}
            className="h-8"
          />
          <span className="text-muted-foreground text-xs">465 с шифрованием, 587 без него</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="smtp-secure">
            Шифрование
          </Label>
          <Select value={values.secure ? "true" : "false"} onValueChange={(value) => set("secure", value === "true")}>
            <SelectTrigger id="smtp-secure" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">TLS сразу (порт 465)</SelectItem>
              <SelectItem value="false">STARTTLS (порт 587)</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">Не тот вариант — отправка зависнет</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(saveSmtpAction(values))}>
          Сохранить настройки почты
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => handle(sendTestMailAction(values))}>
          Отправить тестовое письмо
        </Button>
        <span className="text-muted-foreground text-xs">
          Проверяется то, что сейчас в полях, — сохранять перед этим не нужно. Письмо уйдёт на {testRecipient}
        </span>
      </div>
    </section>
  );
}

/**
 * Входящая почта: общий ящик, из которого приходят заказы с сайта и письма
 * клиентов. Пароль, как у SMTP, в браузер не отдаётся.
 */
export function ImapEditor({
  imap,
  hasPassword,
  envFallback,
}: {
  imap: ImapSettings;
  hasPassword: boolean;
  /** Ящик сейчас берётся из переменных окружения — адрес, чтобы было видно какой */
  envFallback: string | null;
}) {
  const [values, setValues] = useState<ImapSettings>(imap);
  const { pending, handle } = useSettingsAction();
  const [folders, setFolders] = useState<MailFolderNode[] | null>(null);
  const [loadingFolders, startFolders] = useTransition();

  const set = (key: keyof ImapSettings, value: string) => setValues((current) => ({ ...current, [key]: value }));

  function showFolders() {
    startFolders(async () => {
      const result = await listImapFoldersAction(values);
      if (result.ok) setFolders(flattenFolderTree(buildFolderTree(result.folders)));
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Входящая почта (IMAP)</h2>
        <p className="text-muted-foreground text-sm">
          Общий ящик: из него приходят заказы с сайта и письма клиентов в раздел «Почта». Проверяется раз в две минуты;
          новые настройки действуют со следующей проверки. Письма, пришедшие до подключения ящика, не разбираются.
        </p>
        {envFallback ? (
          <p className="text-muted-foreground mt-1 text-xs">
            Сейчас ящик берётся из переменных окружения сервера: {envFallback}. Заполненные здесь настройки главнее.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="imap-host">
            Сервер (IMAP-хост)
          </Label>
          <Input
            id="imap-host"
            value={values.host}
            onChange={(event) => set("host", event.target.value)}
            className="h-8"
          />
          <span className="text-muted-foreground text-xs">Например, imap.yandex.ru или mail.jino.ru. Только SSL</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="imap-port">
            Порт
          </Label>
          <Input
            id="imap-port"
            inputMode="numeric"
            value={String(values.port)}
            onChange={(event) => set("port", event.target.value)}
            className="h-8"
          />
          <span className="text-muted-foreground text-xs">Обычно 993</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="imap-user">
            Пользователь
          </Label>
          <Input
            id="imap-user"
            value={values.user}
            onChange={(event) => set("user", event.target.value)}
            className="h-8"
          />
          <span className="text-muted-foreground text-xs">Полный адрес ящика, например info@bus-com.ru</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label className="text-xs" htmlFor="imap-password">
            Пароль
          </Label>
          <Input
            id="imap-password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={(event) => set("password", event.target.value)}
            className="h-8"
            placeholder={hasPassword ? "сохранён, оставьте пустым" : ""}
          />
          <span className="text-muted-foreground text-xs">
            {hasPassword
              ? "Пустое поле оставит сохранённый пароль"
              : "У Яндекса и mail.ru нужен пароль приложения, а не пароль от ящика"}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => handle(saveImapAction(values))}>
          Сохранить входящую почту
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => handle(testImapAction(values))}>
          Проверить подключение
        </Button>
        <Button size="sm" variant="ghost" disabled={pending || loadingFolders} onClick={showFolders}>
          {loadingFolders ? "Читаю папки…" : "Показать папки ящика"}
        </Button>
        <span className="text-muted-foreground text-xs">
          Проверяется то, что сейчас в полях, — письма не разбираются
        </span>
      </div>

      {folders ? <FolderTree folders={folders} /> : null}
    </section>
  );
}

/**
 * Дерево папок ящика с числом писем. ERP читает только «Входящие» — остальные
 * папки видно здесь, чтобы понять, не раскладывают ли фильтры почтового клиента
 * письма клиентов мимо неё.
 */
function FolderTree({ folders }: { folders: MailFolderNode[] }) {
  const total = folders.filter((folder) => folder.depth === 0).reduce((sum, folder) => sum + folder.totalMessages, 0);
  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">Папки ящика</h3>
        <span className="text-muted-foreground text-xs">
          Всего писем: {total.toLocaleString("ru-RU")}. ERP читает только «Входящие» — письма, которые фильтры
          раскладывают по другим папкам, в «Почту» не попадают.
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="py-1 text-left font-normal">Папка</th>
            <th className="py-1 pl-3 text-right font-normal">Писем</th>
            <th className="py-1 pl-3 text-right font-normal">Непрочитанных</th>
            <th className="py-1 pl-3 text-right font-normal">Со вложенными</th>
          </tr>
        </thead>
        <tbody>
          {folders.map((folder) => {
            const isInbox = folder.specialUse === "\\Inbox" || folder.path.toUpperCase() === "INBOX";
            const label = (folder.specialUse && SPECIAL_FOLDER_LABELS[folder.specialUse]) || folder.name;
            return (
              <tr key={folder.path} className="border-t">
                <td className="py-1" style={{ paddingLeft: `${folder.depth * 1.25}rem` }}>
                  <span className={folder.selectable ? undefined : "text-muted-foreground"}>{label}</span>
                  {label !== folder.name ? (
                    <span className="text-muted-foreground ml-1.5 text-xs">{folder.name}</span>
                  ) : null}
                  {isInbox ? (
                    <span className="bg-primary/10 text-primary ml-2 rounded px-1.5 py-0.5 text-xs">читает ERP</span>
                  ) : null}
                </td>
                <td className="py-1 pl-3 text-right tabular-nums">{folder.messages?.toLocaleString("ru-RU") ?? "—"}</td>
                <td className="text-muted-foreground py-1 pl-3 text-right tabular-nums">
                  {folder.unseen ? folder.unseen.toLocaleString("ru-RU") : ""}
                </td>
                <td className="text-muted-foreground py-1 pl-3 text-right tabular-nums">
                  {folder.children.length > 0 ? folder.totalMessages.toLocaleString("ru-RU") : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
