import { describe, expect, it } from "vitest";
import { canDeactivateMissing } from "./terminals";

describe("canDeactivateMissing", () => {
  it("первая загрузка и обычное обновление гасят пропавшие пункты", () => {
    expect(canDeactivateMissing(0, 265)).toBe(true);
    expect(canDeactivateMissing(265, 262)).toBe(true);
  });

  it("выгрузка заметно меньше того, что есть, — подозрительна: ничего не гасим", () => {
    expect(canDeactivateMissing(265, 100)).toBe(false);
    expect(canDeactivateMissing(265, 0)).toBe(false);
  });
});
