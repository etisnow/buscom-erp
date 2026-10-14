import { describe, expect, it } from "vitest";
import {
  assertOrderFile,
  canDeleteOrderFile,
  fileExtension,
  fileFormat,
  isGalleryImage,
  MAX_ORDER_FILE_BYTES,
  OrderFileError,
  UNKNOWN_CONTENT_TYPE,
} from "./order-files";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

describe("assertOrderFile", () => {
  it("тип — по содержимому, неузнанное — двоичный файл", () => {
    expect(assertOrderFile(PNG)).toBe("image/png");
    expect(assertOrderFile(PDF)).toBe("application/pdf");
    expect(assertOrderFile(new TextEncoder().encode("<svg onload=alert(1)>"))).toBe(UNKNOWN_CONTENT_TYPE);
  });

  it("пустой и слишком большой не принимается", () => {
    expect(() => assertOrderFile(new Uint8Array())).toThrow(OrderFileError);
    expect(() => assertOrderFile(new Uint8Array(MAX_ORDER_FILE_BYTES + 1))).toThrow(OrderFileError);
  });
});

describe("isGalleryImage", () => {
  it("на весь экран — только JPEG, PNG и WebP", () => {
    expect(isGalleryImage("image/jpeg")).toBe(true);
    expect(isGalleryImage("image/webp")).toBe(true);
    expect(isGalleryImage("image/svg+xml")).toBe(false);
    expect(isGalleryImage("application/pdf")).toBe(false);
  });
});

describe("fileExtension", () => {
  it("последнее расширение заглавными", () => {
    expect(fileExtension("Счёт 12.pdf")).toBe("PDF");
    expect(fileExtension("архив.tar.gz")).toBe("GZ");
    expect(fileExtension("таблица.XLSX ")).toBe("XLSX");
  });

  it("без расширения или с подозрительно длинным — пусто", () => {
    expect(fileExtension("README")).toBe("");
    expect(fileExtension("версия 1.2 от поставщика")).toBe("");
    expect(fileExtension("file.verylong")).toBe("");
  });
});

describe("fileFormat", () => {
  it("содержимое важнее расширения", () => {
    expect(fileFormat("скан.bin", "application/pdf")).toBe("pdf");
    expect(fileFormat("фото", "image/jpeg")).toBe("image");
  });

  it("неузнанное по содержимому — по расширению", () => {
    expect(fileFormat("договор.docx", UNKNOWN_CONTENT_TYPE)).toBe("word");
    expect(fileFormat("прайс.xls", UNKNOWN_CONTENT_TYPE)).toBe("sheet");
    expect(fileFormat("фото.zip", UNKNOWN_CONTENT_TYPE)).toBe("archive");
    expect(fileFormat("IMG_1.HEIC", UNKNOWN_CONTENT_TYPE)).toBe("image");
    expect(fileFormat("чертёж.dwg", UNKNOWN_CONTENT_TYPE)).toBe("other");
  });
});

describe("canDeleteOrderFile", () => {
  const file = { uploadedById: "u1" };

  it("свой — можно, чужой — только руководителю и администратору", () => {
    expect(canDeleteOrderFile(file, { id: "u1", role: "MANAGER" })).toBe(true);
    expect(canDeleteOrderFile(file, { id: "u2", role: "MANAGER" })).toBe(false);
    expect(canDeleteOrderFile(file, { id: "u2", role: "HEAD" })).toBe(true);
    expect(canDeleteOrderFile(file, { id: "u2", role: "ADMIN" })).toBe(true);
  });

  it("файл без автора удаляют только руководитель и администратор", () => {
    expect(canDeleteOrderFile({ uploadedById: null }, { id: "u1", role: "MANAGER" })).toBe(false);
    expect(canDeleteOrderFile({ uploadedById: null }, { id: "u1", role: "HEAD" })).toBe(true);
  });
});
