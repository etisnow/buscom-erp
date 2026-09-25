import "server-only";
import { createRequire } from "node:module";
import path from "node:path";
import { createCanvas, loadImage, type Image } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";
import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { readBarcodes } from "zxing-wasm/reader";
import { canManageOrderDocuments } from "@/domain/order/order-document";
import { parseWaybill, type WaybillFields } from "@/domain/order/waybill-parse";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import { getCarriers } from "@/server/settings/service";
import type { SessionUser } from "@/server/session";

/**
 * Распознавание транспортной накладной локально, без облака (решение владельца):
 * PDF с текстовым слоем читается как есть; скан — картинкой через Tesseract
 * (русская модель из пакета `@tesseract.js-data/rus`, в сеть не ходит), плюс
 * штрихкоды через zxing — по ним сверяется номер. Разбор текста в поля —
 * `src/domain/order/waybill-parse.ts`.
 *
 * На сервере одно ядро и 1,5 ГБ памяти: распознаём строго по одному, воркер
 * Tesseract (~250 МБ) создаётся на запрос и сразу закрывается.
 */

export class WaybillRecognitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WaybillRecognitionError";
  }
}

/** Текстовый слой короче — значит, это скан в PDF-обёртке, а не электронный документ. */
const MIN_TEXT_LAYER_CHARS = 200;
/** Ширина, до которой растягиваем мелкий скан: на меньшей Tesseract путает цифры. */
const OCR_WIDTH = 2400;
/** Штрихкод читается не на любом масштабе — перебираем, пока не найдётся. */
const BARCODE_WIDTHS = [0, 1200, 2400, 3600];
/** Первая страница — лицевая, на ней всё нужное; оборот с условиями не читаем. */
const PAGE = 1;

const require = createRequire(path.join(process.cwd(), "package.json"));

function langPath(): string {
  return path.join(path.dirname(require.resolve("@tesseract.js-data/rus/package.json")), "4.0.0_best_int");
}

let queue: Promise<unknown> = Promise.resolve();

/** Следующее распознавание ждёт окончания предыдущего. */
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function drawAt(image: Image, width: number) {
  const canvas = createCanvas(width, Math.round((image.height * width) / image.width));
  const context = canvas.getContext("2d");
  // Прозрачный PNG на чёрном фоне не прочитать — подкладываем белый лист.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function findBarcodes(image: Image): Promise<string[]> {
  for (const target of BARCODE_WIDTHS) {
    const canvas = drawAt(image, target || image.width);
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
    const found = await readBarcodes(
      { data: new Uint8ClampedArray(pixels.data), width: canvas.width, height: canvas.height, colorSpace: "srgb" },
      { tryHarder: true, formats: ["Code128", "QRCode", "DataMatrix", "PDF417"], maxNumberOfSymbols: 4 },
    );
    if (found.length > 0) return found.map((code) => code.text);
  }
  return [];
}

async function ocr(image: Image): Promise<string> {
  const canvas = drawAt(image, Math.max(image.width, OCR_WIDTH));
  const worker = await createWorker("rus", 1, { langPath: langPath(), cacheMethod: "none" });
  try {
    const { data } = await worker.recognize(await canvas.encode("png"));
    return data.text;
  } finally {
    await worker.terminate();
  }
}

/** Текст и штрихкоды файла накладной. */
async function readWaybill(data: Uint8Array, contentType: string): Promise<{ text: string; barcodes: string[] }> {
  if (contentType !== "application/pdf") {
    const image = await loadImage(Buffer.from(data));
    return { barcodes: await findBarcodes(image), text: await ocr(image) };
  }

  // unpdf забирает буфер себе — отдаём копию.
  const pdf = await getDocumentProxy(new Uint8Array(data));
  const render = async (scale: number) =>
    loadImage(
      Buffer.from(await renderPageAsImage(pdf, PAGE, { canvasImport: () => import("@napi-rs/canvas"), scale })),
    );

  const { text: layer } = await extractText(pdf, { mergePages: false });
  const firstPage = layer[PAGE - 1] ?? "";
  const barcodes = await findBarcodes(await render(2));
  if (firstPage.trim().length >= MIN_TEXT_LAYER_CHARS) return { text: firstPage, barcodes };
  return { text: await ocr(await render(3)), barcodes };
}

/**
 * Поля доставки из прикреплённой накладной. Ничего не сохраняет: значения
 * подставляются в форму, сохраняет менеджер после проверки.
 */
export async function recognizeWaybill(orderId: string, user: SessionUser): Promise<WaybillFields> {
  const order = await db.order.findFirst({
    where: { id: orderId, deletedAt: null },
    select: { status: true, documents: { where: { kind: "WAYBILL" }, select: { data: true, contentType: true } } },
  });
  if (!order) throw new WaybillRecognitionError("Заказ не найден");
  if (!canManageOrderDocuments(order.status, user.role)) {
    throw new ForbiddenError("Заказ закрыт — доставку изменить нельзя");
  }
  const [document] = order.documents;
  if (!document) throw new WaybillRecognitionError("Сначала прикрепите накладную");

  const [{ text, barcodes }, carriers] = await Promise.all([
    serialized(() => readWaybill(document.data, document.contentType)),
    getCarriers(),
  ]);
  return parseWaybill(text, barcodes, carriers);
}
