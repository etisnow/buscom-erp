import "server-only";
import { createCanvas, loadImage } from "@napi-rs/canvas";

/** Длинная сторона миниатюры: плитка галереи до ~160 px, запас на экраны с плотными пикселями. */
const THUMB_SIDE = 480;

/**
 * Уменьшенная копия картинки (JPEG) для плитки галереи. Поворот по EXIF canvas
 * применяет сам при чтении — снимок с телефона не ляжет набок. Картинка меньше
 * миниатюры, битая или непонятная → null: плитка покажет оригинал.
 */
export async function makeThumbnail(data: Uint8Array): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const image = await loadImage(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
    const scale = THUMB_SIDE / Math.max(image.width, image.height);
    if (!(scale < 1)) return null;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    // Прозрачный PNG в JPEG — на белом, а не на чёрном
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return new Uint8Array(await canvas.encode("jpeg", 80));
  } catch (error) {
    console.warn(`[files] Миниатюра не сделана: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}
