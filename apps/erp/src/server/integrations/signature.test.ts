import { describe, expect, it } from "vitest";
import { signPayload, verifySignature } from "./signature";

const SECRET = "test-secret-test-secret-test-secret";
const BODY = '{"externalId":"12345"}';

describe("подпись вебхука", () => {
  it("подпись начинается с sha256= и это hex", () => {
    const signature = signPayload(BODY, SECRET);
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("своя подпись проходит проверку", () => {
    expect(verifySignature(BODY, signPayload(BODY, SECRET), SECRET)).toBe(true);
  });

  it("подпись с пробелами по краям принимается", () => {
    expect(verifySignature(BODY, ` ${signPayload(BODY, SECRET)} `, SECRET)).toBe(true);
  });

  it("изменённое тело подпись не проходит", () => {
    expect(verifySignature('{"externalId":"12346"}', signPayload(BODY, SECRET), SECRET)).toBe(false);
  });

  it("чужой секрет не подходит", () => {
    expect(verifySignature(BODY, signPayload(BODY, "another-secret-another-secret-xx"), SECRET)).toBe(false);
  });

  it("без заголовка — отказ", () => {
    expect(verifySignature(BODY, null, SECRET)).toBe(false);
  });

  it("мусор вместо подписи — отказ, а не падение", () => {
    expect(verifySignature(BODY, "sha256=нет", SECRET)).toBe(false);
    expect(verifySignature(BODY, "", SECRET)).toBe(false);
    expect(verifySignature(BODY, "sha256=" + "0".repeat(64), SECRET)).toBe(false);
  });

  it("подпись без префикса не принимается", () => {
    const withoutPrefix = signPayload(BODY, SECRET).slice("sha256=".length);
    expect(verifySignature(BODY, withoutPrefix, SECRET)).toBe(false);
  });

  it("юникод в теле считается одинаково", () => {
    const body = '{"name":"Сиденье «ГАЗель»"}';
    expect(verifySignature(body, signPayload(body, SECRET), SECRET)).toBe(true);
  });
});
