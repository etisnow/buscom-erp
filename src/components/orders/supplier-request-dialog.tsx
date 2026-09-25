"use client";

import { useState, useSyncExternalStore } from "react";
import { Check, Copy, Send, Share2 } from "lucide-react";
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

const noSubscribe = () => () => {};

/** Системное «Поделиться» (Web Share) есть на телефонах; на компьютере обычно нет. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => typeof navigator.share === "function",
    () => false,
  );
}

/**
 * Готовый текст заказа поставщику: его копируют и отправляют в мессенджер.
 * Текст собирает сервер (`buildSupplierRequest`), здесь он только показывается —
 * так формат один на всех и покрыт тестами.
 */
export function SupplierRequestDialog({
  supplierName,
  text,
  prices = "purchase",
}: {
  supplierName: string;
  text: string;
  /** Какие цены в тексте: закупочные или наши цены продажи — влияет только на подписи */
  prices?: "purchase" | "ours";
}) {
  const [copied, setCopied] = useState(false);
  const canShare = useCanShare();

  async function share() {
    try {
      await navigator.share({ text });
    } catch (error) {
      // Закрыли окно «Поделиться» — это не ошибка
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Не удалось открыть «Поделиться» — скопируйте текст");
    }
  }

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
          {prices === "ours" ? "Заказ поставщику (наши цены)" : "Заказ поставщику"}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Заказ для «{supplierName}»{prices === "ours" ? " — наши цены" : ""}
          </DialogTitle>
          <DialogDescription>
            Только позиции этого поставщика, цены {prices === "ours" ? "наши, продажные" : "закупочные"}. Скопируйте и
            отправьте — перед отправкой текст можно поправить в мессенджере.
          </DialogDescription>
        </DialogHeader>

        <pre className="bg-muted max-h-80 overflow-auto rounded-md p-3 text-sm whitespace-pre-wrap select-all">
          {text}
        </pre>

        <div className="flex gap-2 max-md:flex-col">
          {/* На телефоне «Поделиться» сразу открывает мессенджер — без копирования и переключения */}
          {canShare ? (
            <Button onClick={share} className="md:flex-1">
              <Share2 />
              Поделиться
            </Button>
          ) : null}
          <Button onClick={copy} variant={canShare ? "outline" : "default"} className="md:flex-1">
            {copied ? <Check /> : <Copy />}
            {copied ? "Скопировано" : "Скопировать"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
