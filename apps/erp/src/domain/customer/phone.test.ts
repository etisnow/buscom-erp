import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it.each([
    ["+7 (912) 345-67-89", "+79123456789"],
    ["8 912 345 67 89", "+79123456789"],
    ["79123456789", "+79123456789"],
    ["9123456789", "+79123456789"],
  ])("%s → %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([null, undefined, "", "12345", "+1 202 555 0100 00"])("невалидный %j → null", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
