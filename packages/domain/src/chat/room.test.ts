import { describe, expect, it } from "vitest";
import { ChatError } from "./message";
import {
  canDeleteRoom,
  canRenameRoom,
  chatRoomHref,
  GENERAL_CHAT_ROOM_ID,
  MAX_ROOM_NAME,
  normalizeRoomName,
} from "./room";

describe("normalizeRoomName", () => {
  it("схлопывает пробелы и обрезает края", () => {
    expect(normalizeRoomName("  Склад \n и   логистика ")).toBe("Склад и логистика");
  });

  it("пустое и слишком длинное не принимается", () => {
    expect(() => normalizeRoomName("   ")).toThrow(ChatError);
    expect(() => normalizeRoomName("а".repeat(MAX_ROOM_NAME + 1))).toThrow(ChatError);
    expect(normalizeRoomName("а".repeat(MAX_ROOM_NAME))).toHaveLength(MAX_ROOM_NAME);
  });
});

describe("chatRoomHref", () => {
  it("«Общий чат» — на /chat, остальные — по id", () => {
    expect(chatRoomHref(GENERAL_CHAT_ROOM_ID)).toBe("/chat");
    expect(chatRoomHref("abc123")).toBe("/chat/abc123");
  });
});

describe("права на комнату", () => {
  const author = { id: "u1", role: "MANAGER" as const };
  const other = { id: "u2", role: "HEAD" as const };
  const admin = { id: "u3", role: "ADMIN" as const };
  const room = { id: "r1", createdById: "u1" };
  const general = { id: GENERAL_CHAT_ROOM_ID, createdById: null };

  it("создатель и администратор переименовывают и удаляют, остальные — нет", () => {
    expect(canRenameRoom(room, author)).toBe(true);
    expect(canDeleteRoom(room, author)).toBe(true);
    expect(canRenameRoom(room, admin)).toBe(true);
    expect(canDeleteRoom(room, admin)).toBe(true);
    expect(canRenameRoom(room, other)).toBe(false);
    expect(canDeleteRoom(room, other)).toBe(false);
  });

  it("«Общий чат» переименовывает только администратор, удалить нельзя", () => {
    expect(canRenameRoom(general, author)).toBe(false);
    expect(canRenameRoom(general, admin)).toBe(true);
    expect(canDeleteRoom(general, admin)).toBe(false);
  });
});
