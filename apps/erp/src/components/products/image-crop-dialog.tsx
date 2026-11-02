"use client";

import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { toast } from "sonner";
import { cropProductImageAction } from "@/app/(app)/products/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const WIDTH = 640;
const HEIGHT = 420;
type Rect = { x: number; y: number; width: number; height: number };

export function ImageCropDialog({
  imageId,
  open,
  onOpenChange,
}: {
  imageId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const source = useRef<HTMLImageElement | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const [bounds, setBounds] = useState<Rect | null>(null);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !imageId) return;
    const image = new window.Image();
    source.current = null;
    const loaded = () => {
      source.current = image;
      const scale = Math.min(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const frame = { x: (WIDTH - width) / 2, y: (HEIGHT - height) / 2, width, height };
      setBounds(frame);
      setSelection(frame);
    };
    image.addEventListener("load", loaded);
    image.addEventListener("error", () => toast.error("Не удалось открыть картинку"), { once: true });
    image.src = `/api/product-images/${imageId}`;
    return () => image.removeEventListener("load", loaded);
  }, [imageId, open]);

  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (!context || !bounds || !source.current) return;
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = "#1b1b1b";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.drawImage(source.current, bounds.x, bounds.y, bounds.width, bounds.height);
    if (!selection) return;
    context.fillStyle = "rgba(0,0,0,.55)";
    context.fillRect(bounds.x, bounds.y, bounds.width, selection.y - bounds.y);
    context.fillRect(bounds.x, selection.y, selection.x - bounds.x, selection.height);
    context.fillRect(
      selection.x + selection.width,
      selection.y,
      bounds.x + bounds.width - selection.x - selection.width,
      selection.height,
    );
    context.fillRect(
      bounds.x,
      selection.y + selection.height,
      bounds.width,
      bounds.y + bounds.height - selection.y - selection.height,
    );
    context.strokeStyle = "white";
    context.lineWidth = 2;
    context.strokeRect(selection.x, selection.y, selection.width, selection.height);
  }, [bounds, selection]);

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(bounds!.x, Math.min(bounds!.x + bounds!.width, ((event.clientX - box.left) * WIDTH) / box.width)),
      y: Math.max(bounds!.y, Math.min(bounds!.y + bounds!.height, ((event.clientY - box.top) * HEIGHT) / box.height)),
    };
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!origin.current || !bounds) return;
    const end = point(event);
    setSelection({
      x: Math.min(origin.current.x, end.x),
      y: Math.min(origin.current.y, end.y),
      width: Math.abs(end.x - origin.current.x),
      height: Math.abs(end.y - origin.current.y),
    });
  }

  function save() {
    if (!imageId || !bounds || !selection || !source.current || selection.width < 5 || selection.height < 5) return;
    const image = source.current;
    const scale = image.naturalWidth / bounds.width;
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(selection.width * scale));
    output.height = Math.max(1, Math.round(selection.height * scale));
    output
      .getContext("2d")
      ?.drawImage(
        image,
        (selection.x - bounds.x) * scale,
        (selection.y - bounds.y) * scale,
        selection.width * scale,
        selection.height * scale,
        0,
        0,
        output.width,
        output.height,
      );
    output.toBlob((blob) => {
      if (!blob) return toast.error("Не удалось обрезать картинку");
      if (blob.size > 5 * 1024 * 1024) return toast.error("Результат больше 5 МБ — выберите меньшую область");
      const form = new FormData();
      form.set("file", blob, "crop.png");
      startTransition(async () => {
        const result = await cropProductImageAction(imageId, form);
        if (result.ok) {
          toast.success(result.message);
          onOpenChange(false);
        } else toast.error(result.error);
      });
    }, "image/png");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Обрезать картинку</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-xs">
          Выделите нужную область на фото. Чтобы начать заново, проведите по нему ещё раз.
        </p>
        <canvas
          ref={canvas}
          width={WIDTH}
          height={HEIGHT}
          className="w-full cursor-crosshair touch-none rounded-md"
          onPointerDown={(event) => {
            if (!bounds) return;
            origin.current = point(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            move(event);
          }}
          onPointerMove={move}
          onPointerUp={(event) => {
            move(event);
            origin.current = null;
          }}
          onPointerCancel={() => {
            origin.current = null;
          }}
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setSelection(bounds)} disabled={pending}>
            Вся картинка
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={pending || !selection || selection.width < 5 || selection.height < 5}
          >
            {pending ? "Сохраняю…" : "Сохранить обрезку"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
