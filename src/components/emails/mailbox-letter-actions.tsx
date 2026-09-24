"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  addMailboxLetterAction,
  markMailboxLetterOpenedAction,
  moveMailboxLetterAction,
  setMailboxSeenAction,
  trashMailboxLetterAction,
} from "@/app/(app)/mail/actions";

/**
 * Действия с письмом живого ящика: всё меняется прямо в почте и сразу видно в
 * Яндексе. «Удалить» переносит в «Удалённые» — оттуда письмо возвращается;
 * окончательно удаляется только в самой почте.
 */
export function MailboxLetterActions({
  folder,
  uid,
  folders,
  erp,
  seen,
}: {
  folder: string;
  uid: number;
  /** Прочитано ли письмо в ящике на момент открытия */
  seen: boolean;
  folders: { path: string; label: string }[];
  erp: { id: string; customer: { id: string; name: string } | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
  const ref = { folder, uid };

  // Открыли непрочитанное — помечаем прочитанным, как веб-почта. Отдельным
  // действием, а не при отрисовке: иначе «Пометить непрочитанным» тут же
  // откатывалось бы перерисовкой страницы. Ответ действия обновит счётчики слева.
  const opened = useRef(false);
  useEffect(() => {
    if (seen || opened.current) return;
    opened.current = true;
    void markMailboxLetterOpenedAction({ folder, uid });
  }, [seen, folder, uid]);
  const backToFolder = `/mail/box?folder=${encodeURIComponent(folder)}`;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string, leave: boolean) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      if (leave) router.push(backToFolder);
      else router.refresh();
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setMailboxSeenAction(ref, false), "Помечено непрочитанным", true)}
        >
          Пометить непрочитанным
        </Button>

        <div className="flex items-center gap-2">
          <Select value={destination} onValueChange={setDestination}>
            <SelectTrigger size="sm" className="w-52">
              <SelectValue placeholder="Переместить в папку…" />
            </SelectTrigger>
            <SelectContent>
              {folders
                .filter((item) => item.path !== folder)
                .map((item) => (
                  <SelectItem key={item.path} value={item.path}>
                    {item.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !destination}
            onClick={() => run(() => moveMailboxLetterAction(ref, destination), "Письмо перемещено", true)}
          >
            Переместить
          </Button>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() => setConfirmTrash(true)}
        >
          Удалить
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
        {erp ? (
          <span>
            Письмо в переписке ERP
            {erp.customer ? (
              <>
                {" "}
                клиента{" "}
                <Link href={`/customers/${erp.customer.id}`} className="text-primary hover:underline">
                  {erp.customer.name}
                </Link>
              </>
            ) : (
              <>
                , клиент не определён —{" "}
                <Link href={`/mail/${erp.id}`} className="text-primary hover:underline">
                  привязать
                </Link>
              </>
            )}
            .
          </span>
        ) : (
          <>
            <span>Письма нет в переписке ERP.</span>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await addMailboxLetterAction(ref);
                  if (result.ok) toast.success(result.message);
                  else toast.error(result.error);
                  router.refresh();
                })
              }
            >
              Добавить в переписку
            </Button>
          </>
        )}
      </div>

      <Dialog open={confirmTrash} onOpenChange={setConfirmTrash}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить письмо?</DialogTitle>
            <DialogDescription>
              Письмо переместится в «Удалённые» ящика — оттуда его можно вернуть, как в Яндексе. Окончательно письма
              удаляются только в самой почте. Копия в переписке ERP, если есть, останется.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">
                Отмена
              </Button>
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                setConfirmTrash(false);
                run(() => trashMailboxLetterAction(ref), "Письмо в «Удалённых»", true);
              }}
            >
              Удалить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
