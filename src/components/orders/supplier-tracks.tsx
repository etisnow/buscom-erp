"use client";

import { useTransition } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SupplierRequestDialog } from "@/components/orders/supplier-request-dialog";
import { cn } from "@/lib/utils";
import { changeSupplierStageAction } from "@/app/(app)/orders/[number]/actions";

export type SupplierTrackView = {
  supplierId: string;
  supplierName: string;
  stageId: string | null;
  stages: { id: string; name: string }[];
  /** Готовый текст заказа этому поставщику — собран на сервере */
  requestText: string;
};

/**
 * Треки поставщиков в заказе — подстатусы «в работе». У каждого поставщика своя
 * цепочка; этапы проходят по порядку, шаг назад — чтобы поправить ошибку.
 */
export function SupplierTracks({
  orderId,
  orderNumber,
  tracks,
  canMove,
}: {
  orderId: string;
  orderNumber: number;
  tracks: SupplierTrackView[];
  canMove: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function move(track: SupplierTrackView, toStageId: string | null) {
    startTransition(async () => {
      const result = await changeSupplierStageAction({
        orderId,
        orderNumber,
        supplierId: track.supplierId,
        toStageId,
        expectedStageId: track.stageId,
      });
      if (result.ok) toast.success(`${track.supplierName}: этап изменён`);
      else toast.error(result.error);
    });
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border p-4">
      <div>
        <h2 className="font-heading font-medium">Поставщики</h2>
        <p className="text-muted-foreground text-xs">
          В «Выполнен» заказ уйдёт, когда каждый поставщик пройдёт последний этап.
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {tracks.map((track) => {
          const index = track.stages.findIndex((stage) => stage.id === track.stageId);
          const done = track.stages.length === 0 || index === track.stages.length - 1;
          const previous = index > 0 ? track.stages[index - 1].id : null;
          const next = track.stages[index + 1]?.id;

          return (
            <li key={track.supplierId} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{track.supplierName}</span>
                <span className={cn("text-xs", done ? "text-emerald-600" : "text-muted-foreground")}>
                  {track.stages.length === 0
                    ? "цепочка не задана"
                    : index === -1
                      ? "не начат"
                      : `${index + 1} из ${track.stages.length}`}
                </span>
              </div>

              {track.stages.length > 0 ? (
                <ol className="flex flex-col gap-1">
                  {track.stages.map((stage, stageIndex) => (
                    <li
                      key={stage.id}
                      className={cn(
                        "flex items-center gap-2 text-sm",
                        stageIndex > index && "text-muted-foreground",
                        stageIndex === index && "font-medium",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-full border",
                          stageIndex <= index && "bg-primary border-primary text-primary-foreground",
                        )}
                      >
                        {stageIndex < index ? <Check className="size-3" /> : null}
                      </span>
                      {stage.name}
                    </li>
                  ))}
                </ol>
              ) : null}

              {/* Текст заказа доступен всегда — даже у поставщика без цепочки этапов */}
              <div className="flex flex-wrap items-center gap-2">
                <SupplierRequestDialog supplierName={track.supplierName} text={track.requestText} />

                {canMove && track.stages.length > 0 ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending || index === -1}
                      onClick={() => move(track, previous)}
                    >
                      <ChevronLeft />
                      Назад
                    </Button>
                    {next ? (
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => move(track, next)}>
                        {track.stages[index + 1].name}
                        <ChevronRight />
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
