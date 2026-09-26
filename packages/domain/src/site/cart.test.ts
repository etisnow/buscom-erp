import { describe, expect, it } from "vitest";
import { siteOrderSchema } from "../integration/contract";
import { addToCart, buildSiteOrderPayload, checkoutSchema, priceCart, type CatalogProduct } from "./cart";

const seat: CatalogProduct = {
  id: "p-seat",
  sku: "SEAT-1",
  name: "Сиденье Турист",
  slug: "sidene-turist",
  isActive: true,
  priceKopecks: 1_000_000,
  groups: [
    {
      id: "g-belt",
      name: "Ремень",
      required: true,
      values: [
        { id: "v-2", name: "Двухточечный", priceDeltaKopecks: 0 },
        { id: "v-3", name: "Трёхточечный", priceDeltaKopecks: 150_000 },
      ],
    },
    {
      id: "g-arm",
      name: "Подлокотник",
      required: false,
      values: [{ id: "v-arm", name: "Есть", priceDeltaKopecks: 50_000 }],
    },
  ],
};
const glue: CatalogProduct = {
  ...seat,
  id: "p-glue",
  sku: "GLUE",
  name: "Клей",
  slug: "klei",
  priceKopecks: 0,
  groups: [],
};
const catalog = new Map([seat, glue].map((product) => [product.id, product]));

describe("корзина", () => {
  it("одинаковый товар с тем же набором опций складывается, с другим — отдельной позицией", () => {
    let cart = addToCart([], { productId: "p-seat", valueIds: ["v-3", "v-arm"], quantity: 2 });
    cart = addToCart(cart, { productId: "p-seat", valueIds: ["v-arm", "v-3"], quantity: 1 });
    cart = addToCart(cart, { productId: "p-seat", valueIds: ["v-2"], quantity: 1 });
    expect(cart.map((line) => line.quantity)).toEqual([3, 1]);
  });

  it("цена — по каталогу с надбавками опций, суммы из браузера не участвуют", () => {
    const priced = priceCart(
      [
        { productId: "p-seat", valueIds: ["v-3", "v-arm"], quantity: 2 },
        { productId: "p-glue", valueIds: [], quantity: 1 },
      ],
      catalog,
    );
    expect(priced.lines[0]).toMatchObject({ unitPriceKopecks: 1_200_000, totalKopecks: 2_400_000 });
    expect(priced.lines[0].options.map((option) => option.valueName)).toEqual(["Трёхточечный", "Есть"]);
    expect(priced.lines[1]).toMatchObject({ unitPriceKopecks: 0, totalKopecks: 0 });
    expect(priced.totalKopecks).toBe(2_400_000);
    expect(priced.dropped).toEqual([]);
  });

  it("снятый с продажи товар и сломанный выбор опций выпадают с причиной", () => {
    const priced = priceCart(
      [
        { productId: "p-gone", valueIds: [], quantity: 1 },
        { productId: "p-seat", valueIds: [], quantity: 1 },
        { productId: "p-seat", valueIds: ["v-2", "v-чужой"], quantity: 1 },
      ],
      catalog,
    );
    expect(priced.lines).toEqual([]);
    expect(priced.dropped.map((item) => item.lineIndex)).toEqual([0, 1, 2]);
    expect(priced.dropped.map((item) => item.reason)).toEqual([
      "Товар снят с продажи",
      "У «Сиденье Турист» не выбрана обязательная опция «Ремень»",
      "У «Сиденье Турист» выбрана опция, которой у товара нет — обновите страницу",
    ]);
  });
});

describe("оформление", () => {
  const base = {
    requestId: "5d2a8c9e-1b2f-4c3d-8e9f-0a1b2c3d4e5f",
    customerType: "PERSON",
    name: "Иван",
    phone: "8 (912) 345-67-89",
    deliveryMethod: "PICKUP",
    consent: true,
  };

  it("телефон нормализуется, пустые поля — undefined", () => {
    const parsed = checkoutSchema.parse({ ...base, email: "", comment: "  " });
    expect(parsed).toMatchObject({ phone: "+79123456789", email: undefined, comment: undefined });
  });

  it("ошибки — по полям, понятным текстом", () => {
    const result = checkoutSchema.safeParse({
      ...base,
      phone: "123",
      customerType: "COMPANY",
      inn: "12345",
      deliveryMethod: "CARRIER",
      consent: false,
    });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((issue) => issue.path.join(".")).sort();
    expect(paths).toEqual(["address", "carrier", "companyName", "consent", "inn", "phone"]);
  });

  it("бот заполнил поле-ловушку — отказ", () => {
    expect(checkoutSchema.safeParse({ ...base, website: "http://spam" }).success).toBe(false);
  });

  it("заказ для ERP проходит контракт v1: опции, номер от ERP, счёт юрлицу", () => {
    const input = checkoutSchema.parse({
      ...base,
      customerType: "COMPANY",
      companyName: "ООО Ромашка",
      inn: "5261111427",
      deliveryMethod: "CARRIER",
      carrier: "СДЭК",
      address: "Казань, ул. Баумана, 1",
    });
    const cart = priceCart([{ productId: "p-seat", valueIds: ["v-3"], quantity: 1 }], catalog);
    const payload = buildSiteOrderPayload(input, cart);
    expect(siteOrderSchema.parse(payload)).toMatchObject({
      externalId: "web-5d2a8c9e-1b2f-4c3d-8e9f-0a1b2c3d4e5f",
      numberedByErp: true,
      customer: { type: "COMPANY", companyName: "ООО Ромашка", inn: "5261111427", phone: "+79123456789" },
      items: [{ sku: "SEAT-1", priceKopecks: 1_150_000, quantity: 1, options: [{ valueName: "Трёхточечный" }] }],
      delivery: { method: "CARRIER", carrier: "СДЭК", address: "Казань, ул. Баумана, 1" },
      payment: { method: "INVOICE" },
      totalKopecks: 1_150_000,
    });
  });
});
