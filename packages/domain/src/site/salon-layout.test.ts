import { describe, expect, it } from "vitest";
import { salonLayoutSchema } from "./salon-layout";

const valid = { name: "15 мест", seats: 15, armrests: 4, reclinerBacks: 6 };

describe("salonLayoutSchema", () => {
  it("принимает корректную схему и обрезает пробелы в названии", () => {
    expect(salonLayoutSchema.parse({ ...valid, name: "  15 мест " })).toEqual(valid);
  });

  it("допускает нули: подлокотников и откидных спинок может не быть", () => {
    expect(salonLayoutSchema.safeParse({ ...valid, armrests: 0, reclinerBacks: 0 }).success).toBe(true);
  });

  it("не принимает пустое название и схему без мест", () => {
    expect(salonLayoutSchema.safeParse({ ...valid, name: "  " }).success).toBe(false);
    expect(salonLayoutSchema.safeParse({ ...valid, seats: 0 }).success).toBe(false);
  });

  it("не принимает дробные и отрицательные числа", () => {
    expect(salonLayoutSchema.safeParse({ ...valid, armrests: 1.5 }).success).toBe(false);
    expect(salonLayoutSchema.safeParse({ ...valid, reclinerBacks: -1 }).success).toBe(false);
  });

  it("подлокотников и откидных спинок не больше, чем мест", () => {
    const armrests = salonLayoutSchema.safeParse({ ...valid, armrests: 16 });
    expect(armrests.success).toBe(false);
    const backs = salonLayoutSchema.safeParse({ ...valid, reclinerBacks: 16 });
    expect(backs.success).toBe(false);
  });
});
