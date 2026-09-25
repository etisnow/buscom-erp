/**
 * Проверка распознавания накладной в собранном образе (Dockerfile, шаг после
 * копирования standalone). Запускается из /app: грузит те же пакеты, что
 * src/server/orders/waybill-recognition.ts, рисует строку, читает её Tesseract
 * с моделью по тому же пути. Не прочиталось — сборка падает, до выката.
 *
 * Зачем: Tesseract грузит воркер, ядро и модель по путям, которых трассировка
 * standalone не видит. Первый выкат 25.09.2026 собрался и прошёл проверку
 * живости, а кнопка «Заполнить из накладной» в бою падала «Cannot find module».
 */
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(path.join(process.cwd(), "package.json"));
const load = (name) => import(pathToFileURL(require.resolve(name)).href);

const started = Date.now();
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const { readBarcodes } = await load("zxing-wasm/reader");
const { getDocumentProxy } = await load("unpdf");
const { createWorker } = require("tesseract.js");

// Строка «Итог 2973,00», двухцветный PNG. Не рисуем текст сами: для этого canvas
// нужны данные ICU, которых в standalone нет, — приложению они и не нужны.
const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAjAAAABaAQMAAACcz/45AAAABlBMVEX///8fHx8C6jRYAAAACXBIWXMAAAsSAAALEgHS3X78AAACsUlEQVRYw+3WMW7bMBQG4J8hai6B2TGDIPUIGQ1UsHMU3aAaNRAxgxwgV2Knjr0CixygGjJoEMy+Rzqu7bYwVWRoAT0kgEMEn8lH8j0Cc8wxxxxzzDHHfxoq9NDj8UhwqHoRwqh29JcIwNZdZK6Ch345GpA0YAwzOlj6micrnv3l6ayByp5Mb0BfMrOheWEpnbR9FrM5ZnQYhNfEDGtNTCG8QvcXjBil0w8Oq07RYlaiX8JkMZ+OmQI7adWDxW0jmQExdRbz/ZS5V1Z9tmgbQUyHoeT/yWC+HjM3WCsriWnuBKW2xVDkMeLpt4xzPJseXY0yh5FnTKkRGUxk9DHzPjLfIOxEZnHCIDIekhjHjKlRZTIhBGx6FYKPjGUGE5nrxPQjErOOjEKcEDEmj7nR1puFdGsYzgbqyCzA0jTGmYWyFZ3W5sAswT8TmFti6isFbfeMcnSbrqlkTFpUExl9YLrIFLHyTGZKKFfjjkZa6bWnOynlwExtoHMYR+eGjxgzHF4OH6lOUGKGCbMR9pQRXoRnR3cSGCcwMjF0KXxkpEP4khgzhcEZY1EpB//KdCbrTi3OGMW/djKzPGOWkeH7RKP5zPUZU3Bd5wwxk18oijNmlRg7kVkdmLThvEUlZ4dzk8/cJqZ6ZfyeofLXMdPWcZ2XmPaU2eeWzr9jhjrxOqtP+VdG2TodG+5OFTMtmo4aehbjEqNtYvjY0FJKXp2XvoMvY9YvxOYng8S8s1QEqcM1wtE1E07HrF9iLDOGLmbq1ToES3eBPnbUy11Jls1hkBjpi/hyqIjRca/vNdkVN/SsZ5LYvmAHMXYIzBJjuEZgO1LW6eUmgs1i6JlHD6utV9xfiHnseaOheQ+pdOE+4w354dchcfj2jOqZE8u3Ycq3YYq3YVb/FNNijjnmmGOOP8UPPTg8/zPphlAAAAAASUVORK5CYII=",
  "base64",
);
const image = await loadImage(SAMPLE_PNG);
const canvas = createCanvas(image.width * 2, image.height * 2);
const context = canvas.getContext("2d");
context.drawImage(image, 0, 0, canvas.width, canvas.height);

const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
await readBarcodes({ data: new Uint8ClampedArray(pixels.data), width: canvas.width, height: canvas.height }, {});
if (typeof getDocumentProxy !== "function") throw new Error("unpdf не загрузился");

// Тот же путь, что LANG_PATH в waybill-recognition.ts
const langPath = path.join(process.cwd(), "node_modules", "@tesseract.js-data", "rus", "4.0.0_best_int");
const worker = await createWorker("rus", 1, { langPath, cacheMethod: "none" });
const { data } = await worker.recognize(await canvas.encode("png"));
await worker.terminate();

if (!/Итог/.test(data.text)) {
  console.error(`Распознавание не работает: прочитано «${data.text.trim()}»`);
  process.exit(1);
}
console.log(`Распознавание работает: «${data.text.trim()}», ${Date.now() - started} мс`);
