import { describe, expect, it } from "vitest";
import { assertProductImage, detectImageType, MAX_IMAGE_BYTES, ProductImageError } from "./images";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("тип картинки по содержимому", () => {
  it("узнаёт JPEG, PNG, GIF и WebP по сигнатуре", () => {
    expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(detectImageType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe("image/gif");
    expect(detectImageType(bytes(0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50))).toBe("image/webp");
  });

  it("не картинку не принимает, даже если она так названа", () => {
    expect(detectImageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectImageType(bytes(0x25, 0x50, 0x44, 0x46))).toBeNull(); // PDF
    expect(() => assertProductImage(bytes(0x25, 0x50, 0x44, 0x46))).toThrow(ProductImageError);
  });

  it("пустой и слишком большой файл отклоняет", () => {
    expect(() => assertProductImage(bytes())).toThrow(/пустой/);
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect(() => assertProductImage(big)).toThrow(/МБ/);
  });
});
