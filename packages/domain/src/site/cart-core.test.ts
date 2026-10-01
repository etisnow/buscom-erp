import { describe, expect, it } from "vitest";
import { cartSchema } from "./cart";
import { MAX_CART_LINES, MAX_QUANTITY, parseCart } from "./cart-core";

const line = { productId: "p1", valueIds: ["v1", "v2"], quantity: 2 };

describe("parseCart — корзина из localStorage без zod", () => {
  it("принимает корректную корзину", () => {
    expect(parseCart([line])).toEqual([line]);
    expect(parseCart([])).toEqual([]);
  });

  it("отвергает корзину целиком, если хоть одна позиция битая", () => {
    expect(parseCart([line, { ...line, quantity: 0 }])).toBeNull();
    expect(parseCart([{ ...line, quantity: 1.5 }])).toBeNull();
    expect(parseCart([{ ...line, quantity: MAX_QUANTITY + 1 }])).toBeNull();
    expect(parseCart([{ ...line, productId: "" }])).toBeNull();
    expect(parseCart([{ ...line, productId: "x".repeat(65) }])).toBeNull();
    expect(parseCart([{ ...line, valueIds: [1] }])).toBeNull();
    expect(parseCart([{ ...line, valueIds: Array.from({ length: 21 }, (_, i) => `v${i}`) }])).toBeNull();
    expect(parseCart([null])).toBeNull();
    expect(parseCart({})).toBeNull();
    expect(parseCart(Array.from({ length: MAX_CART_LINES + 1 }, () => line))).toBeNull();
  });

  it("лишние поля отбрасывает, как схема на сервере", () => {
    expect(parseCart([{ ...line, priceKopecks: 1 }])).toEqual([line]);
  });

  it("совпадает со схемой сервера на тех же примерах", () => {
    const samples: unknown[] = [
      [line],
      [{ ...line, quantity: 0 }],
      [{ ...line, valueIds: [] }],
      [{ productId: "p", valueIds: ["a"], quantity: MAX_QUANTITY }],
      "мусор",
      [{ ...line, valueIds: ["ok", ""] }],
    ];
    for (const sample of samples) {
      const server = cartSchema.safeParse(sample);
      expect(parseCart(sample)).toEqual(server.success ? server.data : null);
    }
  });
});
