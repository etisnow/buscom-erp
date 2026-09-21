"use client";

import { useState } from "react";
import { Check, Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Готовый текст заказа поставщику: его копируют и отправляют в мессенджер.
 * Текст собирает сервер (`buildSupplierRequest`), здесь он только показывается —
 * так формат один на всех и покрыт тестами.
 */
export function SupplierRequestDialog({ supplierName, text }: { supplierName: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Галочка держится пару секунд — подтверждение, что нажатие сработало
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Браузер не дал доступ к буферу обмена — выделите текст и скопируйте вручную");
    }
  }

  return (
    <Dialog onOpenChange={(open) => !open && setCopied(false)}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Send />
          Заказ поставщику
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Заказ для «{supplierName}»</DialogTitle>
          <DialogDescription>
            Только позиции этого поставщика, цены закупочные. Скопируйте и отправьте — перед отправкой текст можно
            поправить в мессенджере.
          </DialogDescription>
        </DialogHeader>

        <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-sm whitespace-pre-wrap select-all">
          {text}
        </pre>

        <Button onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Скопировано" : "Скопировать"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
