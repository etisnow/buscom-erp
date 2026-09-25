import { describe, expect, it } from "vitest";
import {
  assertAttachments,
  attachmentExpiryCutoff,
  canDeleteMessage,
  canEditMessage,
  ChatError,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENTS_BYTES,
  MAX_MESSAGE_LENGTH,
  normalizeMessageText,
} from "@/domain/chat/message";

describe("normalizeMessageText", () => {
  it("обрезает края и схлопывает пустые строки", () => {
    expect(normalizeMessageText("  привет\r\n\r\n\r\n\r\nмир  ", 0)).toBe("привет\n\nмир");
  });

  it("пустой текст — только с файлами", () => {
    expect(() => normalizeMessageText("   ", 0)).toThrow(ChatError);
    expect(normalizeMessageText("   ", 1)).toBe("");
  });

  it("слишком длинный текст не принимается", () => {
    expect(() => normalizeMessageText("а".repeat(MAX_MESSAGE_LENGTH + 1), 0)).toThrow(ChatError);
    expect(normalizeMessageText("а".repeat(MAX_MESSAGE_LENGTH), 0)).toHaveLength(MAX_MESSAGE_LENGTH);
  });
});

describe("assertAttachments", () => {
  it("пропускает обычный набор", () => {
    expect(() => assertAttachments([{ byteSize: 100 }, { byteSize: 200 }])).not.toThrow();
    expect(() => assertAttachments([])).not.toThrow();
  });

  it("ограничивает число, пустые файлы и общий размер", () => {
    const tooMany = Array.from({ length: MAX_ATTACHMENTS + 1 }, () => ({ byteSize: 1 }));
    expect(() => assertAttachments(tooMany)).toThrow(ChatError);
    expect(() => assertAttachments([{ byteSize: 0 }])).toThrow("пустой");
    expect(() => assertAttachments([{ byteSize: MAX_ATTACHMENTS_BYTES }, { byteSize: 1 }])).toThrow(ChatError);
  });
});

describe("права на сообщение", () => {
  const own = { userId: "u1", deletedAt: null };
  const manager = { id: "u1", role: "MANAGER" as const };
  const other = { id: "u2", role: "HEAD" as const };
  const admin = { id: "u3", role: "ADMIN" as const };

  it("исправить можно только своё", () => {
    expect(canEditMessage(own, manager)).toBe(true);
    expect(canEditMessage(own, other)).toBe(false);
    expect(canEditMessage(own, admin)).toBe(false);
  });

  it("удалить — своё, а администратору и чужое", () => {
    expect(canDeleteMessage(own, manager)).toBe(true);
    expect(canDeleteMessage(own, other)).toBe(false);
    expect(canDeleteMessage(own, admin)).toBe(true);
  });

  it("удалённое не правится и не удаляется повторно", () => {
    const deleted = { userId: "u1", deletedAt: new Date() };
    expect(canEditMessage(deleted, manager)).toBe(false);
    expect(canDeleteMessage(deleted, admin)).toBe(false);
  });
});

describe("attachmentExpiryCutoff", () => {
  it("ровно 365 дней назад", () => {
    expect(attachmentExpiryCutoff(new Date("2026-09-25T12:00:00Z"))).toEqual(new Date("2025-09-25T12:00:00Z"));
  });
});
