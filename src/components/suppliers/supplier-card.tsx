"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Trash } from "lucide-react";
import { toast } from "sonner";
import { StageChainEditor, type StageRow } from "@/components/suppliers/stage-chain-editor";
import { SupplierFields, type SupplierFormValue } from "@/components/suppliers/supplier-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deleteSupplierAction,
  setSupplierStagesAction,
  updateSupplierAction,
  type SupplierResult,
} from "@/app/(app)/suppliers/actions";

function useAction() {
  const [pending, startTransition] = useTransition();

  function handle(action: Promise<SupplierResult>) {
    startTransition(async () => {
      const result = await action;
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
    });
  }

  return { pending, handle };
}

export function SupplierForm({
  supplierId,
  initial,
  editable,
}: {
  supplierId: string;
  initial: SupplierFormValue;
  editable: boolean;
}) {
  const [value, setValue] = useState(initial);
  const { pending, handle } = useAction();

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <h2 className="font-heading font-medium">Данные поставщика</h2>
      <SupplierFields value={value} onChange={setValue} disabled={!editable} idPrefix="supplier" />
      {editable ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !value.name.trim()}
            onClick={() => handle(updateSupplierAction(supplierId, value))}
          >
            Сохранить
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * Цепочка статусов поставщика: подстатусы заказа, пока он в работе. У каждого
 * поставщика в заказе свой трек по этой цепочке; в «Выполнен» заказ уходит,
 * когда все треки на последнем этапе.
 */
export function SupplierStages({
  supplierId,
  initial,
  editable,
}: {
  supplierId: string;
  initial: StageRow[];
  editable: boolean;
}) {
  const [stages, setStages] = useState(initial);
  const { pending, handle } = useAction();
  const dirty =
    stages.length !== initial.length ||
    stages.some((stage, index) => stage.key !== initial[index].key || stage.name !== initial[index].name);

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Цепочка статусов</h2>
        <p className="text-muted-foreground text-sm">
          Этапы работы с поставщиком по порядку. В заказе это подстатусы «в работе»: заказ станет «Выполнен», только
          когда поставщик пройдёт последний этап.
        </p>
      </div>

      <StageChainEditor stages={stages} onChange={setStages} disabled={!editable || pending} />

      {editable && dirty ? (
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => setStages(initial)}>
            Отменить правки
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              handle(
                setSupplierStagesAction(
                  supplierId,
                  stages.map((stage) => ({ id: stage.id, name: stage.name })),
                ),
              )
            }
          >
            Сохранить цепочку
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Удаление поставщика. Если он уже есть в заказах, сервер откажет и объяснит почему. */
export function DeleteSupplier({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteSupplierAction(supplierId);
      if (!result.ok) {
        toast.error(result.error);
        setOpen(false);
        return;
      }
      toast.success(result.message);
      router.push("/suppliers");
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Trash />
        Удалить
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Удалить поставщика?</DialogTitle>
            <DialogDescription>
              «{supplierName}», его цепочка статусов и закупочные цены у товаров будут удалены без возможности
              восстановить. Поставщика, который уже указан в заказах, удалить нельзя.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={remove}>
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
