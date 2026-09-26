"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/** Отмена заказа требует причины из справочника; уточнение — по желанию (PRD, карточка заказа). */
export function CancelDialog({
  open,
  onOpenChange,
  pending,
  reasons,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  /** Справочник причин; наполняется администратором (PRD, M8) */
  reasons: string[];
  onConfirm: (reason: string, comment: string) => void;
}) {
  const [reason, setReason] = useState<string>("");
  const [comment, setComment] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отмена заказа</DialogTitle>
          <DialogDescription>Причина попадёт в журнал заказа и в отчёты. Резерв товара будет снят.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancel-reason">Причина</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="cancel-reason">
                <SelectValue placeholder="Выберите причину" />
              </SelectTrigger>
              <SelectContent>
                {reasons.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="cancel-comment">Уточнение (необязательно)</Label>
            <Textarea
              id="cancel-comment"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Не отменять
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !reason}
            onClick={() => {
              onConfirm(reason, comment);
              onOpenChange(false);
              setComment("");
            }}
          >
            Отменить заказ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
