import { describe, expect, it } from "vitest";
import { ChatError } from "./message";
import { normalizeReaction } from "./reaction";

describe("normalizeReaction", () => {
  it("принимает обычные эмодзи и обрезает пробелы", () => {
    expect(normalizeReaction(" 👍 ")).toBe("👍");
    expect(normalizeReaction("✅")).toBe("✅");
    expect(normalizeReaction("⚠️")).toBe("⚠️");
  });

  it("принимает составные: с оттенком кожи и склеенные через соединитель", () => {
    expect(normalizeReaction("👍🏽")).toBe("👍🏽");
    expect(normalizeReaction("👨‍👩‍👧")).toBe("👨‍👩‍👧");
  });

  it("не принимает текст, цифры, пустоту и смесь текста с эмодзи", () => {
    for (const bad of ["", "  ", "a", "1", "да", "👍 да", "👍👍👍👍👍👍👍👍👍👍"]) {
      expect(() => normalizeReaction(bad), JSON.stringify(bad)).toThrow(ChatError);
    }
  });
});
