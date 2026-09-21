"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { StageChainEditor, type StageRow } from "@/components/suppliers/stage-chain-editor";
import { EMPTY_SUPPLIER, SupplierFields } from "@/components/suppliers/supplier-fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createSupplierAction } from "@/app/(app)/suppliers/actions";

/** Заведение поставщика сразу с цепочкой статусов — её можно поправить и потом, в карточке. */
export function NewSupplierDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(EMPTY_SUPPLIER);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createSupplierAction(
        value,
        stages.map((stage) => ({ name: stage.name })),
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      setValue(EMPTY_SUPPLIER);
      setStages([]);
      toast.success("Поставщик заведён");
      router.push(`/suppliers/${result.id}`);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus />
        Новый поставщик
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Новый поставщик</DialogTitle>
            <DialogDescription>Обязательно только название. Реквизиты можно дозаполнить в карточке.</DialogDescription>
          </DialogHeader>

          <SupplierFields value={value} onChange={setValue} idPrefix="new-supplier" />

          <div className="flex flex-col gap-2 border-t pt-3">
            <span className="text-sm font-medium">Цепочка статусов</span>
            <StageChainEditor stages={stages} onChange={setStages} disabled={pending} />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" disabled={pending || !value.name.trim()} onClick={submit}>
              Завести
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
