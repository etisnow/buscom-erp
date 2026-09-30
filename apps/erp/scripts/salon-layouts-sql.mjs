/**
 * SQL для загрузки чертежей схем салона в БД без туннеля и без доступа приложения к боевой базе —
 * то же, что делает `import:salon-layout-images`, но результатом служит SQL, который передаётся в psql
 * по ssh. Ничего никуда сам не отправляет: печатает SQL в stdout.
 *
 *   node apps/erp/scripts/salon-layouts-sql.mjs --check | ssh buscom-prod "docker exec -i buscom-erp-postgres-1 psql -U buscom -d buscom_erp"
 *   node apps/erp/scripts/salon-layouts-sql.mjs         | ssh buscom-prod "docker exec -i buscom-erp-postgres-1 psql -q -v ON_ERROR_STOP=1 -U buscom -d buscom_erp"
 *
 * `--check` — только запрос «что сейчас лежит», ничего не меняет. Без флага:
 *  - свои чертежи (`scripts/salon-layouts/<id схемы>.png|jpg|webp`) записываются всегда, адрес источника стирается;
 *  - остальные схемы скачиваются с bus-com.ru и записываются, только если картинки у схемы ещё нет.
 * Всё в одной транзакции; в конце — отчёт по восьми схемам. Вывод — только ASCII, чтобы пройти
 * через PowerShell без порчи. Повторный запуск безопасен.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "salon-layouts");
const SITE = "https://bus-com.ru/image/catalog/scheme-choice/";

/** Схемы без своего чертежа: id → файл на сайте (те же адреса, что в миграции salon_layouts) */
const FROM_SITE = {
  salon_layout_17: "17.jpg",
  salon_layout_17_front3: "17%20%D1%82%D1%80%D0%B8%20%D1%81%D0%BF%D0%B5%D1%80%D0%B5%D0%B4%D0%B8.jpg",
  salon_layout_18_closed: "18%20%D0%B7%D0%B0%D0%BA%D1%80%D1%8B%D1%82%D1%8B%D0%B9%20%D1%80%D1%8F%D0%B4.jpg",
  salon_layout_18_front3_closed:
    "18%20%D1%82%D1%80%D0%B8%20%D1%81%D0%BF%D0%B5%D1%80%D0%B5%D0%B4%D0%B8,%20%D0%B7%D0%B0%D0%BA%D1%80%D1%8B%D1%82%D1%8B%D0%B9%20%D1%80%D1%8F%D0%B4.jpg",
};
const IDS = [
  "salon_layout_14",
  "salon_layout_15",
  "salon_layout_15_closed",
  "salon_layout_16_closed",
  ...Object.keys(FROM_SITE),
];

const REPORT = `SELECT id, length("imageData") AS bytes, "imageContentType" AS type, ("imageSourceUrl" IS NULL) AS own_drawing FROM "SalonLayout" ORDER BY "sortOrder";`;

function contentType(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

function own(id) {
  for (const extension of ["png", "jpg", "webp"]) {
    const file = path.join(OWN_DIR, `${id}.${extension}`);
    if (existsSync(file)) return readFileSync(file);
  }
  return null;
}

if (process.argv.includes("--check")) {
  console.log(REPORT);
  process.exit(0);
}

const statements = [];
for (const id of IDS) {
  const mine = own(id);
  let bytes = mine;
  if (!bytes) {
    const response = await fetch(SITE + FROM_SITE[id], { headers: { "User-Agent": "BusCom-ERP catalog sync" } });
    if (!response.ok) throw new Error(`${id}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  const type = contentType(bytes);
  if (!type) throw new Error(`${id}: это не картинка`);
  const set = `"imageData" = decode('${bytes.toString("hex")}', 'hex'), "imageContentType" = '${type}', "updatedAt" = now()`;
  statements.push(
    mine
      ? `UPDATE "SalonLayout" SET ${set}, "imageSourceUrl" = NULL WHERE id = '${id}';`
      : `UPDATE "SalonLayout" SET ${set} WHERE id = '${id}' AND "imageData" IS NULL;`,
  );
}

console.log(["BEGIN;", ...statements, REPORT, "COMMIT;"].join("\n"));
