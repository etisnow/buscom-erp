import { describe, expect, it } from "vitest";
import {
  assertSupplierDocument,
  canManageSupplierDocuments,
  detectDocumentType,
  MAX_DOCUMENT_BYTES,
  SupplierDocumentError,
} from "./supplier-document";

const PDF_HEADER = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"
const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("detectDocumentType", () => {
  it("узнаёт PDF, JPEG, PNG и WebP по сигнатуре", () => {
    expect(detectDocumentType(PDF_HEADER)).toBe("application/pdf");
    expect(detectDocumentType(JPEG_HEADER)).toBe("image/jpeg");
    expect(detectDocumentType(PNG_HEADER)).toBe("image/png");
    expect(detectDocumentType(WEBP_HEADER)).toBe("image/webp");
  });

  it("прочее не определяет", () => {
    expect(detectDocumentType(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(detectDocumentType(new Uint8Array())).toBeNull();
  });
});

describe("assertSupplierDocument", () => {
  it("принимает файл нужного типа и размера, отдаёт тип", () => {
    expect(assertSupplierDocument(PDF_HEADER)).toBe("application/pdf");
  });

  it("отклоняет пустой файл", () => {
    expect(() => assertSupplierDocument(new Uint8Array())).toThrow(SupplierDocumentError);
  });

  it("отклоняет файл больше лимита", () => {
    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    big.set(PDF_HEADER);
    expect(() => assertSupplierDocument(big)).toThrow(SupplierDocumentError);
  });

  it("отклоняет неопознанный тип", () => {
    expect(() => assertSupplierDocument(new Uint8Array([1, 2, 3, 4]))).toThrow("Это не PDF и не картинка");
  });
});

describe("canManageSupplierDocuments", () => {
  it("разрешает менеджеру, руководителю и администратору вне финальных статусов", () => {
    expect(canManageSupplierDocuments("IN_PROGRESS", "MANAGER")).toBe(true);
    expect(canManageSupplierDocuments("NEW", "HEAD")).toBe(true);
    expect(canManageSupplierDocuments("IN_PROGRESS", "ADMIN")).toBe(true);
  });

  it("запрещает в финальных статусах, даже администратору", () => {
    expect(canManageSupplierDocuments("COMPLETED", "ADMIN")).toBe(false);
    expect(canManageSupplierDocuments("CANCELLED", "ADMIN")).toBe(false);
  });
});
