"use client";

import { useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  attachMailboxLetterAction,
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
}: {
  folder: string;
  uid: number;
  folders: { path: string; label: string }[];
  erp: { id: string; orderNumber: number | null } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [confirmTrash, setConfirmTrash] = useState(false);
  const ref = { folder, uid };
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

      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        {erp?.orderNumber ? (
          <span className="text-sm">
            В переписке заказа{" "}
            <Link href={`/orders/${erp.orderNumber}`} className="text-primary hover:underline">
              №{erp.orderNumber}
            </Link>
            . Перепривязать:
          </span>
        ) : erp ? (
          <span className="text-sm">
            Письмо уже в ERP, без заказа (
            <Link href={`/mail/${erp.id}`} className="text-primary hover:underline">
              открыть
            </Link>
            ). Привязать к заказу:
          </span>
        ) : (
          <span className="text-sm">Привязать к заказу — письмо с вложениями ляжет в его переписку:</span>
        )}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const number = Number(orderNumber.replace(/\D/g, ""));
            if (!(number > 0)) {
              toast.error("Введите номер заказа в ERP");
              return;
            }
            run(() => attachMailboxLetterAction(ref, number), `Письмо в переписке заказа №${number}`, false);
          }}
        >
          <Input
            value={orderNumber}
            onChange={(event) => setOrderNumber(event.target.value)}
            placeholder="№ заказа в ERP"
            inputMode="numeric"
            className="h-8 w-36"
            aria-label="Номер заказа в ERP"
          />
          <Button type="submit" size="sm" disabled={pending}>
            Привязать
          </Button>
        </form>
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
