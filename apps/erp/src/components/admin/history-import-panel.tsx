"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatMoscowDate, formatMoscowDateTime } from "@/domain/datetime";
import { HISTORY_YEARS, type HistoryFolder } from "@/domain/email/history";
import type { HistoryImportState } from "@/server/emails/history-import";
import {
  historyFoldersAction,
  resumeHistoryImportAction,
  startHistoryImportAction,
} from "@/app/(app)/admin/mail/actions";

const n = (value: number) => value.toLocaleString("ru-RU");

/**
 * Импорт истории переписки из общего ящика: письма с клиентами за последние
 * годы, вложения названиями. Идёт в фоне на сервере; пока идёт — страница
 * обновляется сама раз в 5 секунд.
 */
export function HistoryImportPanel({ state, running }: { state: HistoryImportState | null; running: boolean }) {
  const router = useRouter();
  const [folders, setFolders] = useState<HistoryFolder[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const inProgress = state?.status === "running";

  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [inProgress, router]);

  function loadFolders() {
    startTransition(async () => {
      const result = await historyFoldersAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setFolders(result.folders);
      setChosen(new Set(result.folders.map((folder) => folder.path)));
    });
  }

  function start() {
    startTransition(async () => {
      const result = await startHistoryImportAction([...chosen]);
      if (result.ok) {
        toast.success(result.message);
        setFolders(null);
        router.refresh();
      } else toast.error(result.error);
    });
  }

  function resume() {
    startTransition(async () => {
      const result = await resumeHistoryImportAction();
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      router.refresh();
    });
  }

  const toggle = (path: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Импорт истории переписки</h2>
        <p className="text-muted-foreground text-sm">
          Письма с клиентами за последние {HISTORY_YEARS} года из выбранных папок ящика: входящие и «Отправленные».
          Берутся только письма, где собеседник есть среди клиентов; рассылки, поставщики и сервисы не переносятся.
          Клиент письма определяется по цепочке, номеру заказа на сайте в теме или адресу. Вложения переносятся
          названиями, файлы остаются в ящике. Повторный запуск дублей не создаёт.
        </p>
      </div>

      {state ? <HistoryProgress state={state} /> : null}

      {state?.status === "failed" && !running ? (
        <div>
          <Button size="sm" disabled={pending} onClick={resume}>
            Продолжить с места остановки
          </Button>
        </div>
      ) : null}

      {!inProgress && !running ? (
        folders ? (
          <div className="flex flex-col gap-2 border-t pt-3">
            <div className="text-sm font-medium">Папки для импорта</div>
            <ul className="flex flex-col gap-1">
              {folders.map((folder) => (
                <li key={folder.path}>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="accent-primary size-4"
                      checked={chosen.has(folder.path)}
                      onChange={() => toggle(folder.path)}
                    />
                    <span>{folder.path}</span>
                    <span className="text-muted-foreground text-xs">
                      {n(folder.messages)} писем · {folder.direction === "OUTBOUND" ? "наши письма" : "входящие"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">
              Спам, удалённые и черновики не предлагаются. Число писем — за всё время; в импорт пойдут только за{" "}
              {HISTORY_YEARS} года и только с клиентами.
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={pending || chosen.size === 0} onClick={start}>
                Запустить импорт
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setFolders(null)}>
                Отмена
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button size="sm" variant="outline" disabled={pending} onClick={loadFolders}>
              {pending ? "Читаю папки…" : state ? "Импортировать ещё раз" : "Выбрать папки и запустить"}
            </Button>
          </div>
        )
      ) : null}
    </section>
  );
}

function HistoryProgress({ state }: { state: HistoryImportState }) {
  const processed = state.folders.reduce((sum, folder) => sum + folder.processed, 0);
  const total = state.folders.reduce((sum, folder) => sum + folder.total, 0);
  const statusText =
    state.status === "running"
      ? "Идёт импорт"
      : state.status === "done"
        ? `Закончен ${state.finishedAt ? formatMoscowDateTime(new Date(state.finishedAt)) : ""}`
        : "Прерван";

  return (
    <div className="flex flex-col gap-2 border-t pt-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{statusText}</span>
        <span className="text-muted-foreground text-xs">
          с {formatMoscowDate(new Date(state.since))} · запущен {formatMoscowDateTime(new Date(state.startedAt))}
        </span>
      </div>
      {state.error ? <p className="text-destructive text-xs">Ошибка: {state.error}</p> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground text-xs">Просмотрено писем</dt>
          <dd className="tabular-nums">
            {n(processed)}
            {total ? ` из ${n(total)}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Перенесено</dt>
          <dd className="tabular-nums">{n(state.imported)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">С известным клиентом</dt>
          <dd className="tabular-nums">{n(state.linkedToCustomers + state.relinked)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Не с клиентами / уже были</dt>
          <dd className="tabular-nums">
            {n(state.skipped)} / {n(state.duplicates)}
          </dd>
        </div>
      </dl>
      <ul className="flex flex-col gap-0.5 text-xs">
        {state.folders.map((folder) => (
          <li key={folder.path} className="flex justify-between gap-2">
            <span className={folder.done ? "text-muted-foreground" : undefined}>{folder.path}</span>
            <span className="text-muted-foreground tabular-nums">
              {folder.done ? "готово · " : ""}
              {n(folder.processed)}
              {folder.total ? ` из ${n(folder.total)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
